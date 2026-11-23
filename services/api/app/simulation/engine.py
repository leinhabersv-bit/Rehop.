"""Seeded simulation starter, in-memory. Every number is fictional and explicitly labeled."""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from threading import RLock
from uuid import uuid4

from app.domain.errors import SimulationError as SimulationError
from app.domain.invariants import check_invariants
from app.domain.state_machine import transition_journey, transition_ride
from app.intelligence.decision import compare_wait_switch
from app.intelligence.llm import classify_driver_message, explain_with_verified_numbers
from app.intelligence.policy import ACTIVE_RIDE_STATES, STOPPED, may_rebook
from app.intelligence.recovery import rank_backups
from app.intelligence.risk import assess
from app.schemas.domain import (
    ChatSignal,
    DeadlineDecision,
    EventPayload,
    FeeNotice,
    JourneyEvent,
    JourneySnapshot,
    Quote,
    Ride,
    RiskAssessment,
    TelemetrySample,
)
from app.schemas.enums import (
    ChatLabel,
    EventType,
    GpsQuality,
    JourneyState,
    OpStatus,
    Provider,
    RideState,
    RiskBand,
)
from app.schemas.requests import JourneyCreate, Location
from app.simulation.providers import ADAPTERS, PROVIDERS

BASE_TIME = datetime(2026, 11, 23, 8, 30, tzinfo=UTC)
LOCATIONS = [
    Location(label="VIT Chennai", lat=12.8406, lng=80.1534),
    Location(label="Chennai Airport", lat=12.9941, lng=80.1709),
    Location(label="Guindy", lat=13.0067, lng=80.2206),
    Location(label="T Nagar", lat=13.0418, lng=80.2341),
]
SCENARIOS = {
    "S01": "Healthy pickup",
    "S02": "Temporary traffic stop",
    "S03": "Driver stalled, ETA increasing",
    "S04": "Driver cancels",
    "S05": "Second driver also cancels",
    "S06": "No available backup",
    "S07": "Backups exceed fare cap",
    "S08": "Stale GPS updates",
    "S09": "Near pickup, stationary",
    "S10": "Arrival/cancellation race",
    "S11": "User cancels during recovery",
    "S12": "Booking status unknown",
    "S13": "Driver chat requests rider cancellation",
    "S14": "Refreshed backup unavailable: original preserved",
    "S15": "Quote lost after cancellation: disclose recovery gap",
    "S16": "Urgent and relaxed pickup deadlines",
}


Command = tuple[str, str | bool | None, int | None]


class Session:
    def __init__(self, request: JourneyCreate, scenario: str = "S01", seed: int = 2026):
        if request.need_by is not None and request.need_by <= BASE_TIME:
            raise SimulationError(
                "INVALID_PICKUP_DEADLINE", "Pickup deadline must follow simulation start.", status=422
            )
        self.id = f"journey_{uuid4().hex[:12]}"
        self.pickup = request.pickup.model_copy()
        self.dropoff = request.dropoff.model_copy()
        self.policy = request.policy.model_copy()
        self.need_by = request.need_by or (BASE_TIME + timedelta(minutes=20))
        self.driver_chat_signal: ChatSignal | None = None
        self.decision: DeadlineDecision | None = None
        self.explained_bands: set[RiskBand] = set()
        self.cancellation_fee_notice: FeeNotice | None = None
        self.scenario = scenario
        self.seed = seed
        self.rng = random.Random(seed)
        self.clock = BASE_TIME
        self.state = JourneyState.CREATED
        self.version = 0
        self.events: list[JourneyEvent] = []
        self.quotes = self._make_quotes()
        self.ride: Ride | None = None
        self.last_ride: Ride | None = None
        self.pending_backup: Quote | None = None
        self.risk: RiskAssessment | None = None
        self.recovery_attempts = 0
        self.ride_count = 0
        self.ride_ticks = 0
        self.stationary_ticks = 0
        self.eta_delta_s = 0
        self.attempted_providers: set[Provider] = set()
        self.idempotency: dict[str, tuple[Command, tuple[str, str] | None]] = {}
        self.booking_uncertain = False
        self.add_event(EventType.JOURNEY_CREATED, {"scenario": scenario, "is_simulated": True})
        self.add_event(EventType.QUOTES_READY, {"quotes": self.quotes})
        self._transition_journey(JourneyState.WAITING_FOR_RIDE, reason="Initial quotes are ready.")

    def _make_quotes(self) -> list[Quote]:
        quotes = [ADAPTERS[name].search(self.id, self.clock) for name in PROVIDERS]
        if self.scenario == "S07":
            for quote in quotes:
                if quote.provider != Provider.PROVIDER_A:
                    quote.estimated_fare_inr += 120
        return quotes

    def _refresh_backup(self, quote: Quote) -> Quote | None:
        """A fresh simulated search/select/init BEFORE touching the current booking."""
        if self.scenario == "S14":
            self.add_event(
                EventType.QUOTE_REFRESH_FAILED, {"reason": "Backup disappeared during search; original kept"}
            )
            return None
        refreshed = ADAPTERS[quote.provider].search(
            self.id, self.clock, fare=quote.estimated_fare_inr, eta=quote.pickup_eta_sec
        )
        if refreshed.estimated_fare_inr > self.policy.max_total_fare_inr or not ADAPTERS[quote.provider].init(
            refreshed, self.clock
        ):
            self.add_event(EventType.QUOTE_REFRESH_FAILED, {"reason": "Quote no longer eligible"})
            return None
        self.quotes = [refreshed if q.provider == refreshed.provider else q for q in self.quotes]
        self.add_event(EventType.QUOTE_REFRESHED, {"candidate": refreshed, "not_a_reservation": True})
        return refreshed

    def _fee_notice(self) -> FeeNotice:
        fare = next(
            (q.estimated_fare_inr for q in self.quotes if self.ride and q.quote_id == self.ride.quote_id),
            0,
        )
        bound = min(round(fare * 0.10), 100)
        # Guideline 18.2 applies ONLY to passenger cancellation without valid reason;
        # actual provider/state rule may differ. This is a simulation estimate.
        return FeeNotice(
            potential_fee_upper_bound_inr=bound,
            actual_fee_inr=None,
            fee_confirmed=False,
            source="MVAG 2025 clause 18.2: conditional illustration",
            caution="Not a guaranteed charge. Provider and state rules govern; "
            "valid reasons may avoid the fee.",
        )

    def _evaluate_backup(self, ride: Ride, candidate: Quote) -> DeadlineDecision:
        fee = self._fee_notice()
        current_fare = next((q.estimated_fare_inr for q in self.quotes if q.quote_id == ride.quote_id), 0)
        return compare_wait_switch(
            now=self.clock,
            need_by=self.need_by,
            current_eta_sec=ride.eta_sec,
            backup_eta_sec=candidate.pickup_eta_sec,
            current_fare_inr=current_fare,
            backup_fare_inr=candidate.estimated_fare_inr,
            cancellation_fee_upper_bound_inr=fee.potential_fee_upper_bound_inr,
            risk_band=self.risk.band if self.risk else RiskBand.UNKNOWN,
            chat_signal=self.driver_chat_signal.label if self.driver_chat_signal else None,
        )

    def driver_message(self, text: str, key: str) -> JourneySnapshot:
        command = ("driver_message", text, None)
        if (replay := self._replay(key, command)) is not None:
            return replay
        self._classify_driver_message(text)
        self.idempotency[key] = (command, None)
        return self._checked_snapshot()

    def _classify_driver_message(self, text: str) -> None:
        if not self.ride or self.state in STOPPED:
            raise SimulationError("INVALID_STATE", "No active driver conversation.")
        self.driver_chat_signal = classify_driver_message(text)
        self.add_event(
            EventType.DRIVER_MESSAGE_CLASSIFIED,
            {"message": text[:300], "signal": self.driver_chat_signal},
            self.ride.ride_id,
        )
        # Never cancel from driver chat. Advice can elevate attention, not permissions.
        if self.driver_chat_signal.label == ChatLabel.REQUEST_RIDER_CANCEL:
            self.add_event(
                EventType.RISK_SIGNAL_ADDED,
                {"signal": "driver_requests_rider_cancellation", "advisory_only": True},
                self.ride.ride_id,
            )

    def add_event(self, kind: EventType, payload: EventPayload, ride_id: str | None = None) -> JourneyEvent:
        self.version += 1
        event = JourneyEvent(
            event_id=f"{self.id}_evt_{len(self.events) + 1:04}",
            journey_id=self.id,
            seq=len(self.events) + 1,
            timestamp=self.clock,
            type=kind,
            ride_id=ride_id,
            payload=payload,
        )
        self.events.append(event)
        return event

    def snapshot(self) -> JourneySnapshot:
        return JourneySnapshot(
            id=self.id,
            pickup=self.pickup,
            dropoff=self.dropoff,
            created_at=BASE_TIME,
            state=self.state,
            need_by=self.need_by,
            driver_chat_signal=self.driver_chat_signal,
            deadline_decision=self.decision,
            cancellation_fee_notice=self.cancellation_fee_notice,
            active_ride_id=self.ride.ride_id if self.ride else None,
            version=self.version,
            last_event_seq=len(self.events),
            policy=self.policy,
            quotes=self.quotes,
            active_ride=self.ride,
            last_ride=self.last_ride,
            risk=self.risk,
            pending_backup=self.pending_backup,
            recovery_attempts=self.recovery_attempts,
            booking_uncertain=self.booking_uncertain,
            scenario=self.scenario,
            simulated_time=self.clock,
            is_simulated=True,
        )

    def _checked_snapshot(self) -> JourneySnapshot:
        snapshot = self.snapshot()
        check_invariants(snapshot)
        return snapshot

    def _transition_journey(self, target: JourneyState, *, reason: str) -> None:
        if target == self.state:
            return
        self.state = transition_journey(self.state, target, reason=reason)
        if target in STOPPED:
            self.pending_backup = None

    def _validate_version(self, expected_version: int | None):
        if expected_version is not None and expected_version != self.version:
            raise SimulationError(
                "STALE_JOURNEY_VERSION", "Refresh journey state before acting.", retryable=True
            )

    def _replay(self, key: str, command: Command) -> JourneySnapshot | None:
        if key not in self.idempotency:
            return None
        previous_command, failure = self.idempotency[key]
        if command != previous_command:
            raise SimulationError("IDEMPOTENCY_KEY_REUSED", "This key belongs to a different request.")
        if failure:
            raise SimulationError(*failure)
        return self._checked_snapshot()

    def book(self, quote_id: str, key: str, *, expected_version: int | None = None) -> JourneySnapshot:
        command = ("book", quote_id, expected_version)
        if (replay := self._replay(key, command)) is not None:
            return replay
        self._validate_version(expected_version)
        try:
            result = self._book(quote_id, replacement=False)
        except SimulationError as exc:
            if exc.code == "BOOKING_UNCONFIRMED":
                self.idempotency[key] = (command, (exc.code, str(exc)))
            raise
        self.idempotency[key] = (command, None)
        return result

    def _book(self, quote_id: str, *, replacement: bool) -> JourneySnapshot:
        if self.state in STOPPED:
            raise SimulationError("INVALID_STATE", "Journey is no longer accepting bookings.")
        if self.booking_uncertain or self.state == JourneyState.RECONCILING:
            raise SimulationError("BOOKING_UNCONFIRMED", "Prior booking outcome needs reconciliation.")
        if self.ride and self.ride.state in ACTIVE_RIDE_STATES:
            raise SimulationError(
                "ACTIVE_RIDE_EXISTS", "Cancel and verify existing ride before booking another."
            )
        if self.ride_count > 0 and not replacement:
            raise SimulationError(
                "INVALID_STATE", "Additional bookings must use the bounded recovery workflow."
            )
        quote = next((q for q in self.quotes if q.quote_id == quote_id), None)
        if not quote:
            raise SimulationError("QUOTE_NOT_FOUND", "Quote is missing or expired.", retryable=True)
        if quote.estimated_fare_inr > self.policy.max_total_fare_inr:
            raise SimulationError("POLICY_FARE_LIMIT", "Ride exceeds the user-approved fare limit.")
        if self.clock >= quote.expires_at:
            raise SimulationError("QUOTE_EXPIRED", "Request an updated quote.", retryable=True)
        result = ADAPTERS[quote.provider].confirm(quote, self.clock)
        if result.status == OpStatus.FAILED:
            raise SimulationError("QUOTE_EXPIRED", "Request an updated quote.", retryable=True)
        if result.status == OpStatus.UNKNOWN or (self.scenario == "S12" and self.ride_count == 0):
            self.booking_uncertain = True
            self._transition_journey(JourneyState.RECONCILING, reason="Booking result is unknown.")
            self.add_event(
                EventType.ERROR,
                {
                    "code": "BOOKING_UNCONFIRMED",
                    "message": "Booking result unknown. Do not retry automatically.",
                },
            )
            self._checked_snapshot()
            raise SimulationError("BOOKING_UNCONFIRMED", "Booking response timed out; verification required.")
        self.ride_count += 1
        self.ride_ticks = 0
        self.stationary_ticks = 0
        self.eta_delta_s = 0
        self.risk = None
        self.pending_backup = None
        self.decision = None
        self.driver_chat_signal = None
        self.explained_bands.clear()
        self.cancellation_fee_notice = None
        self.ride = Ride(
            ride_id=f"ride_{self.ride_count}_{self.id}",
            journey_id=self.id,
            provider=quote.provider,
            quote_id=quote_id,
            state=transition_ride(
                RideState.CONFIRMED, RideState.DRIVER_EN_ROUTE, reason="Provider confirmed the booking."
            ),
            booked_at=self.clock,
            driver_id=f"SIM_DRIVER_{self.ride_count}",
            distance_to_pickup_m=(100 if self.scenario == "S09" else 2200),
            eta_sec=quote.pickup_eta_sec,
            last_position_at=self.clock,
            cancellation_fee_inr=None,
            gps_quality=GpsQuality.GOOD,
            is_simulated=True,
        )
        self._transition_journey(JourneyState.MONITORING, reason="Provider confirmed the booking.")
        self.attempted_providers.add(quote.provider)
        self.add_event(
            EventType.RIDE_CONFIRMED,
            {"ride": self.ride.model_copy(), "replacement": replacement},
            self.ride.ride_id,
        )
        if replacement:
            self.add_event(
                EventType.RECOVERY_SUCCEEDED,
                {"attempt": self.recovery_attempts, "provider": quote.provider},
                self.ride.ride_id,
            )
        return self._checked_snapshot()

    def _backups(self) -> list[Quote]:
        provider = self.ride.provider if self.ride else (self.last_ride.provider if self.last_ride else None)
        if self.scenario == "S06":
            return []
        return rank_backups(
            self.quotes,
            excluding_provider=provider,
            max_fare_inr=self.policy.max_total_fare_inr,
            attempted_providers=self.attempted_providers,
        )

    def _confirm_replacement(self, candidate: Quote) -> JourneySnapshot:
        permitted, reason = may_rebook(
            journey_state=self.state,
            active_ride_state=self.ride.state if self.ride else None,
            attempts=self.recovery_attempts,
            max_attempts=self.policy.max_recovery_attempts,
            quote_fare_inr=candidate.estimated_fare_inr,
            max_fare_inr=self.policy.max_total_fare_inr,
            original_cancel_confirmed=self.last_ride is not None
            and self.last_ride.state in {RideState.DRIVER_CANCELLED, RideState.RIDER_CANCELLED},
        )
        if not permitted:
            self.add_event(EventType.RECOVERY_BLOCKED, {"reason": reason})
            self._clear_proposal("Recovery policy refused the replacement.")
            return self._checked_snapshot()
        self.recovery_attempts += 1
        self._transition_journey(JourneyState.RECOVERING, reason="Recovery policy allowed the replacement.")
        self.add_event(
            EventType.RECOVERY_STARTED, {"attempt": self.recovery_attempts, "candidate": candidate}
        )
        try:
            return self._book(candidate.quote_id, replacement=True)
        except SimulationError as exc:
            if self.state == JourneyState.RECONCILING:
                return self._checked_snapshot()
            self._transition_journey(
                JourneyState.EXHAUSTED, reason="Replacement booking failed after cancellation."
            )
            self.add_event(
                EventType.RECOVERY_EXHAUSTED, {"reason": exc.code, "original_cancellation_confirmed": True}
            )
            return self._checked_snapshot()

    def _recover_after_cancel(self):
        if self.state == JourneyState.USER_CANCELLED:
            return
        if self.recovery_attempts >= self.policy.max_recovery_attempts:
            self._transition_journey(JourneyState.EXHAUSTED, reason="Recovery attempt limit reached.")
            self.add_event(EventType.RECOVERY_EXHAUSTED, {"reason": "POLICY_RETRY_LIMIT"})
            return
        candidates = self._backups()
        if not candidates:
            self._transition_journey(
                JourneyState.EXHAUSTED, reason="No eligible backup after driver cancellation."
            )
            self.add_event(
                EventType.RECOVERY_EXHAUSTED,
                {"reason": "No eligible backup under fare and availability rules"},
            )
            return
        candidate = None
        for ranked in candidates:
            candidate = self._refresh_backup(ranked)
            if candidate is not None:
                break
        if not candidate:
            self._transition_journey(
                JourneyState.EXHAUSTED, reason="No fresh backup after driver cancellation."
            )
            self.add_event(
                EventType.RECOVERY_EXHAUSTED, {"reason": "No fresh backup after driver cancellation"}
            )
            return
        if not self.policy.auto_rebook_on_confirmed_driver_cancel:
            self.pending_backup = candidate
            self._transition_journey(
                JourneyState.AWAITING_APPROVAL,
                reason="A replacement after driver cancellation requires approval.",
            )
            self.add_event(EventType.BACKUP_FOUND, {"candidate": candidate})
            self.add_event(
                EventType.APPROVAL_REQUIRED, {"reason": "Driver cancelled; approve a replacement booking."}
            )
            return
        self._confirm_replacement(candidate)

    def driver_cancel(self):
        if not self.ride or self.state in STOPPED or self.state == JourneyState.RECONCILING:
            return
        cancelled = self.ride.model_copy()
        self.ride.state = transition_ride(
            self.ride.state, RideState.DRIVER_CANCELLED, reason="Driver cancelled the ride."
        )
        self.last_ride = self.ride.model_copy()
        self.add_event(EventType.DRIVER_CANCELLED, {"provider": cancelled.provider}, cancelled.ride_id)
        self.ride = None
        self.pending_backup = None
        self.cancellation_fee_notice = None
        self.decision = None
        self._recover_after_cancel()
        self._checked_snapshot()

    def tick(self, steps: int) -> JourneySnapshot:
        for _ in range(steps):
            self.clock += timedelta(seconds=5)
            if not self.ride or self.state in STOPPED or self.state == JourneyState.RECONCILING:
                continue
            if self.ride.state == RideState.DRIVER_ARRIVED:
                continue
            self.ride_ticks += 1
            if (
                self.scenario in {"S04", "S05", "S06", "S07"}
                and self.ride_ticks >= 8
                and self.ride_count <= (2 if self.scenario == "S05" else 1)
            ):
                self.driver_cancel()
                continue
            if self.scenario == "S10" and self.ride_ticks >= 6:
                self._arrive()
                continue
            if self.scenario == "S08" and self.ride_ticks >= 4:
                # Leave last_position_at unchanged: GPS freshness becomes unknown.
                gps_age = (self.clock - self.ride.last_position_at).total_seconds()
                self.risk = assess(
                    stationary_duration_s=self.stationary_ticks * 5,
                    eta_delta_s=self.eta_delta_s,
                    distance_to_pickup_m=self.ride.distance_to_pickup_m,
                    gps_age_s=int(gps_age),
                    gps_quality=GpsQuality.POOR,
                )
                self.add_event(EventType.RISK_UPDATED, self.risk, self.ride.ride_id)
                continue
            stationary = (
                (self.ride_count == 1 and self.scenario in {"S03", "S11", "S13", "S14", "S15", "S16"})
                or (self.scenario == "S02" and 3 <= self.ride_ticks <= 7)
                or self.scenario == "S09"
            )
            if stationary:
                self.stationary_ticks += 1
                self.eta_delta_s += 15
                self.ride.eta_sec += 15
            else:
                self.stationary_ticks = 0
                self.eta_delta_s = 0
                self.ride.distance_to_pickup_m = max(0, self.ride.distance_to_pickup_m - 150)
                self.ride.eta_sec = max(0, self.ride.eta_sec - 5)
            self.ride.last_position_at = self.clock
            sample = TelemetrySample(
                ride_id=self.ride.ride_id,
                observed_at=self.ride.last_position_at,
                distance_to_pickup_m=self.ride.distance_to_pickup_m,
                eta_sec=self.ride.eta_sec,
                gps_quality=GpsQuality.GOOD,
            )
            # The legacy telemetry event carries only these sample fields.
            self.add_event(
                EventType.TELEMETRY_UPDATED,
                {
                    "distance_to_pickup_m": sample.distance_to_pickup_m,
                    "eta_sec": sample.eta_sec,
                    "gps_quality": sample.gps_quality,
                    "is_simulated": True,
                },
                sample.ride_id,
            )
            self.risk = assess(
                stationary_duration_s=self.stationary_ticks * 5,
                eta_delta_s=self.eta_delta_s,
                distance_to_pickup_m=sample.distance_to_pickup_m,
                gps_age_s=0,
                gps_quality=sample.gps_quality,
            )
            if (
                self.risk.band in {RiskBand.MEDIUM, RiskBand.HIGH}
                and self.risk.band not in self.explained_bands
            ):
                checked = explain_with_verified_numbers(
                    self.risk.explanation, [self.ride.eta_sec, self.ride.distance_to_pickup_m]
                )
                self.risk.explanation = checked.explanation
                self.risk.explanation_source = checked.source
                self.explained_bands.add(self.risk.band)
                self.add_event(
                    EventType.EXPLANATION_VERIFIED,
                    {"source": checked.source, "numbers_checked_against_telemetry": True},
                    self.ride.ride_id,
                )
            self.add_event(EventType.RISK_UPDATED, self.risk, self.ride.ride_id)
            if self.scenario == "S13" and self.ride_count == 1 and self.ride_ticks == 5:
                self._classify_driver_message("Please cancel kar do, I am not coming.")
            if (
                self.risk.band in {RiskBand.HIGH, RiskBand.MEDIUM}
                and not self.pending_backup
                and self.recovery_attempts < self.policy.max_recovery_attempts
            ):
                candidates = self._backups()
                if candidates:
                    assessment = self._evaluate_backup(self.ride, candidates[0])
                    self.decision = assessment
                    self.add_event(EventType.DEADLINE_DECISION, assessment, self.ride.ride_id)
                    if assessment.recommendation == "PROPOSE_SWITCH":
                        self.pending_backup = candidates[0]
                        self.cancellation_fee_notice = self._fee_notice()
                        self._transition_journey(
                            JourneyState.AWAITING_APPROVAL,
                            reason="A preemptive switch requires rider approval.",
                        )
                        self.add_event(
                            EventType.BACKUP_FOUND, {"candidate": self.pending_backup}, self.ride.ride_id
                        )
                        self.add_event(
                            EventType.APPROVAL_REQUIRED,
                            {
                                "reason": "Deadline-aware switching proposal; rider approval required",
                                "cancellation_fee_notice": self.cancellation_fee_notice,
                            },
                            self.ride.ride_id,
                        )
                else:
                    self.add_event(
                        EventType.RECOVERY_BLOCKED, {"reason": "No eligible backup"}, self.ride.ride_id
                    )
            if self.ride.distance_to_pickup_m <= 0:
                self._arrive()
        return self._checked_snapshot()

    def _arrive(self):
        if not self.ride or self.ride.state == RideState.DRIVER_ARRIVED:
            return
        self.ride.state = transition_ride(
            self.ride.state, RideState.DRIVER_ARRIVED, reason="Driver reached the pickup point."
        )
        self.ride.distance_to_pickup_m = 0
        self.ride.eta_sec = 0
        self.ride.last_position_at = self.clock
        self._transition_journey(
            JourneyState.MONITORING, reason="Driver arrival superseded the switch proposal."
        )
        self.risk = None
        self.decision = None
        self.pending_backup = None
        self.cancellation_fee_notice = None
        self.add_event(
            EventType.DRIVER_ARRIVED, {"message": "Simulated driver reached pickup."}, self.ride.ride_id
        )

    def approve_switch(
        self, approved: bool, key: str, expected_version: int | None = None
    ) -> JourneySnapshot:
        command = ("approve_switch", approved, expected_version)
        if (replay := self._replay(key, command)) is not None:
            return replay
        self._validate_version(expected_version)
        if not self.pending_backup or self.state != JourneyState.AWAITING_APPROVAL:
            raise SimulationError("INVALID_STATE", "No switch approval is pending.")
        if not self.ride and (not self.last_ride or self.last_ride.state != RideState.DRIVER_CANCELLED):
            raise SimulationError("CANCEL_UNCONFIRMED", "Cannot confirm original cancellation.")
        if not approved:
            reason = "Rider chose to keep waiting." if self.ride else "Rider declined replacement."
            self.add_event(EventType.SWITCH_REJECTED, {"reason": reason})
            self._clear_proposal(reason)
            self.idempotency[key] = (command, None)
            return self._checked_snapshot()
        if self.recovery_attempts >= self.policy.max_recovery_attempts:
            self.add_event(EventType.RECOVERY_BLOCKED, {"reason": "POLICY_RETRY_LIMIT"})
            self._clear_proposal("Recovery attempt limit reached.")
            self.idempotency[key] = (command, None)
            return self._checked_snapshot()

        # Refresh provider offer before any rider-side cancellation.
        candidate = self._refresh_backup(self.pending_backup)
        if candidate is None:
            self._clear_proposal("The refreshed backup is unavailable.")
            self.idempotency[key] = (command, None)
            return self._checked_snapshot()
        if self.ride:
            self.cancellation_fee_notice = self._fee_notice()
            if (
                self.cancellation_fee_notice.potential_fee_upper_bound_inr
                > self.policy.max_cancellation_fee_inr
            ):
                self.add_event(EventType.RECOVERY_BLOCKED, {"reason": "CANCELLATION_FEE_LIMIT"})
                self._clear_proposal("Cancellation fee limit would be exceeded.")
                self.idempotency[key] = (command, None)
                return self._checked_snapshot()
        self.add_event(
            EventType.SWITCH_APPROVED,
            {"new_provider": candidate.provider, "cancellation_fee_notice": self.cancellation_fee_notice},
        )
        if self.ride:
            try:
                self._cancel_active_ride(self.ride)
            except SimulationError as exc:
                self.idempotency[key] = (command, (exc.code, str(exc)))
                raise

        # A refreshed quote is not a reservation. Providers may still reject confirm.
        if self.scenario == "S15":
            self.add_event(
                EventType.REPLACEMENT_QUOTE_LOST,
                {"reason": "Illustrative race after confirmed original cancellation"},
            )
            self._clear_proposal("Replacement quote was lost after cancellation.")
            self.idempotency[key] = (command, None)
            return self._checked_snapshot()
        result = self._confirm_replacement(candidate)
        self.idempotency[key] = (command, None)
        return result

    def _clear_proposal(self, reason: str) -> None:
        self.pending_backup = None
        self.cancellation_fee_notice = None
        self._transition_journey(
            JourneyState.MONITORING if self.ride else JourneyState.EXHAUSTED, reason=reason
        )

    def _cancel_active_ride(self, ride: Ride) -> None:
        ride_state = transition_ride(
            ride.state, RideState.RIDER_CANCELLED, reason="Rider requested cancellation."
        )
        payload = {"old_provider": ride.provider}
        self.add_event(EventType.RIDE_CANCEL_REQUESTED, payload, ride.ride_id)
        result = ADAPTERS[ride.provider].cancel(ride.model_copy())
        if result.status == OpStatus.UNKNOWN:
            self._transition_journey(JourneyState.RECONCILING, reason="Cancellation result is unknown.")
            self.pending_backup = None
            self.cancellation_fee_notice = None
        if result.status != OpStatus.CONFIRMED:
            raise SimulationError("CANCEL_UNCONFIRMED", "Provider cancellation confirmation missing.")
        ride.state = ride_state
        self.last_ride = ride.model_copy()
        self.ride = None
        self.add_event(EventType.RIDE_CANCEL_CONFIRMED, payload, ride.ride_id)

    def cancel(self, key: str, expected_version: int | None = None) -> JourneySnapshot:
        command = ("cancel", None, expected_version)
        if (replay := self._replay(key, command)) is not None:
            return replay
        self._validate_version(expected_version)
        if self.state == JourneyState.USER_CANCELLED:
            self.idempotency[key] = (command, None)
            return self._checked_snapshot()
        stopped_state = transition_journey(
            self.state, JourneyState.USER_CANCELLED, reason="Rider stopped the journey."
        )
        if self.ride and self.state != JourneyState.RECONCILING:
            try:
                self._cancel_active_ride(self.ride)
            except SimulationError as exc:
                self.idempotency[key] = (command, (exc.code, str(exc)))
                raise
        self.state = stopped_state
        self.pending_backup = None
        self.cancellation_fee_notice = None
        self.idempotency[key] = (command, None)
        self.add_event(EventType.USER_CANCELLED, {"message": "Rider stopped the journey."})
        return self._checked_snapshot()

    def confirm_pickup(self, key: str, expected_version: int | None = None) -> JourneySnapshot:
        command = ("confirm_pickup", None, expected_version)
        if (replay := self._replay(key, command)) is not None:
            return replay
        self._validate_version(expected_version)
        if not self.ride or self.ride.state != RideState.DRIVER_ARRIVED:
            raise SimulationError("INVALID_STATE", "Confirm pickup only after driver arrives.")
        ride_state = transition_ride(
            self.ride.state, RideState.IN_PROGRESS, reason="Passenger boarded the ride after arrival."
        )
        self._transition_journey(JourneyState.PICKUP_CONFIRMED, reason="Passenger boarded the arrived ride.")
        self.ride.state = ride_state
        self.pending_backup = None
        self.cancellation_fee_notice = None
        self.idempotency[key] = (command, None)
        self.add_event(
            EventType.PICKUP_CONFIRMED, {"message": "Passenger boarded simulated ride."}, self.ride.ride_id
        )
        return self._checked_snapshot()


class SimulationStore:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.last_scenario: dict[str, str] = {}
        self.lock = RLock()

    def create(self, request: JourneyCreate, scenario: str = "S01", seed: int = 2026):
        session = Session(request, scenario, seed)
        self.sessions[session.id] = session
        return session

    def get(self, journey_id: str):
        session = self.sessions.get(journey_id)
        if not session:
            raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)
        return session


store = SimulationStore()
