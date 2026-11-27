"""Locked journey commands using the existing local and hosted persistence paths."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from pydantic import Field, TypeAdapter, ValidationError

from app.domain.errors import SimulationError
from app.domain.invariants import check_invariants
from app.domain.state_machine import ACTIVE_RIDE_STATES, transition_journey, transition_ride
from app.domain.state_machine import TERMINAL_JOURNEY_STATES as STOPPED
from app.intelligence.history import TelemetryHistory
from app.intelligence.interface import DefaultIntelligence, IntelligencePort
from app.schemas.domain import (
    DeadlineDecision,
    FeeNotice,
    JourneySnapshot,
    PlaybackState,
    Quote,
    Ride,
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
from app.schemas.requests import InjectRequest, JourneyCreate, Location, PlaybackSpeed
from app.simulation.durable import clock_now, create_ride, open_ride
from app.simulation.engine import Session, store
from app.simulation.scenarios import script_for
from app.simulation.world import DriverSim, MotionMode
from app.storage.idempotency import FailureResponse, IdempotencyRecord, fingerprint, key_reused


class JourneyService:
    intelligence: IntelligencePort = DefaultIntelligence()

    def create(
        self, request: JourneyCreate, scenario: str = "S01", *, profiled: bool | None = None
    ) -> Session:
        return create_ride(request, scenario=scenario, profiled=profiled)

    def book(
        self,
        journey_id: str,
        quote_id: str,
        key: str,
        *,
        session: Session | None = None,
        expected_version: int | None = None,
        rider_id: str | None = None,
        recent_ids: tuple[str, ...] = (),
    ) -> JourneySnapshot:
        with self._open_session(journey_id, session, rider_id=rider_id, recent_ids=recent_ids) as journey:
            result = self._idempotent(
                journey,
                "book",
                key,
                {"quote_id": quote_id, "expected_version": expected_version},
                lambda: self._book_primary(journey, quote_id, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def approve_switch(
        self,
        journey_id: str,
        approved: bool,
        key: str,
        *,
        session: Session | None = None,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with self._open_session(journey_id, session) as journey:
            result = self._idempotent(
                journey,
                "approve_switch",
                key,
                {"approved": approved, "expected_version": expected_version},
                lambda: self._approve_switch(journey, approved, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def cancel(
        self,
        journey_id: str,
        key: str,
        *,
        session: Session | None = None,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with self._open_session(journey_id, session) as journey:
            result = self._idempotent(
                journey,
                "cancel",
                key,
                {"expected_version": expected_version},
                lambda: self._cancel(journey, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def confirm_pickup(
        self,
        journey_id: str,
        key: str,
        *,
        session: Session | None = None,
        expected_version: int | None = None,
        boarded_at: datetime | None = None,
        trip_duration: Callable[[Location, Location], timedelta] | None = None,
    ) -> JourneySnapshot:
        with self._open_session(journey_id, session) as journey:
            result = self._idempotent(
                journey,
                "confirm_pickup",
                key,
                {"expected_version": expected_version},
                lambda: self._confirm_pickup(journey, expected_version, boarded_at, trip_duration),
            )
            check_invariants(journey.snapshot())
            return result

    def driver_message(
        self, journey_id: str, text: str, key: str, *, session: Session | None = None
    ) -> JourneySnapshot:
        with self._open_session(journey_id, session) as journey:
            result = self._idempotent(
                journey, "driver_message", key, {"text": text}, lambda: self._message(journey, text)
            )
            check_invariants(journey.snapshot())
            return result

    def play(self, journey_id: str, speed: PlaybackSpeed) -> PlaybackState:
        with open_ride(journey_id) as journey:
            if journey.state == JourneyState.PICKUP_CONFIRMED:
                start = journey.destination_started_at or journey.boarded_at
                end = journey.arrives_at
                now = clock_now()
                if start is None or end is None or now >= end:
                    raise SimulationError(
                        "DESTINATION_PLAYBACK_UNAVAILABLE", "This trip is no longer available for playback."
                    )
                current_speed = journey.destination_speed or 20
                if speed != current_speed:
                    scale = current_speed / speed
                    journey.destination_started_at = now - (now - start) * scale
                    journey.arrives_at = now + (end - now) * scale
                journey.destination_speed = speed
                return PlaybackState(playing=True, speed=speed)
            if not journey.playing or journey.speed != speed:
                journey.last_tick = None
            journey.playing = True
            journey.speed = speed
            return PlaybackState(playing=journey.playing, speed=journey.speed)

    def pause(self, journey_id: str) -> PlaybackState:
        with open_ride(journey_id) as journey:
            journey.playing = False
            return PlaybackState(playing=journey.playing, speed=journey.speed)

    def inject(self, journey_id: str, request: InjectRequest) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            try:
                self._apply_injection(journey, request)
            except ValidationError as error:
                raise SimulationError(
                    "INVALID_INJECTION", "Invalid parameters for this injection kind.", status=422
                ) from error
            return self._checked_snapshot(journey)

    def _apply_injection(self, journey: Session, request: InjectRequest) -> None:
        params = request.params
        match request.kind:
            case "FORCE_MODE":
                mode = TypeAdapter(MotionMode).validate_python(params.get("mode"))
                duration = TypeAdapter(
                    Annotated[int, Field(strict=True, ge=1, le=180)] | None
                ).validate_python(params.get("duration_ticks"))
                self._require_en_route(journey)
                driver = journey.driver_sim or self._create_driver_sim(journey)
                driver.force_mode(mode, duration)
            case "DRIVER_CANCEL":
                self._require_en_route(journey)
                self._driver_cancel(journey)
            case "DRIVER_MESSAGE":
                message = TypeAdapter(Annotated[str, Field(min_length=1, max_length=500)]).validate_python(
                    params.get("text")
                )
                self._classify_driver_message(journey, message)
            case "FORCE_CONFIRM_RESULT" | "FORCE_CANCEL_RESULT":
                result = TypeAdapter(OpStatus).validate_python(params.get("result"))
                provider = TypeAdapter(Provider).validate_python(params.get("provider"))
                overrides = journey.provider_overrides
                outcomes = (
                    overrides.next_confirm
                    if request.kind == "FORCE_CONFIRM_RESULT"
                    else overrides.next_cancel
                )
                outcomes[provider] = result
            case "BACKUP_UNAVAILABLE":
                journey.backup_unavailable_stage = TypeAdapter(
                    Literal["search", "refresh"] | None
                ).validate_python(params.get("stage", "search"))
            case "FARE_SURGE":
                providers = TypeAdapter(Annotated[set[Provider], Field(min_length=1)]).validate_python(
                    params.get("providers")
                )
                amount = TypeAdapter(Annotated[int, Field(strict=True, ge=1, le=100000)]).validate_python(
                    params.get("amount")
                )
                # Retain quote identity, ETA, and expiry while changing the simulated offer.
                for quote in journey.quotes:
                    if quote.provider in providers:
                        offers = journey.provider_overrides.quote_offers
                        fare, eta = offers.get(
                            quote.provider, (quote.estimated_fare_inr, quote.pickup_eta_sec)
                        )
                        offers[quote.provider] = (fare + amount, eta)
                        if not journey.ride or journey.ride.quote_id != quote.quote_id:
                            quote.estimated_fare_inr = fare + amount
                journey.add_event(EventType.QUOTES_READY, {"quotes": journey.quotes})
            case "NEED_BY":
                minutes = TypeAdapter(Annotated[int, Field(strict=True, ge=1, le=1440)]).validate_python(
                    params.get("minutes")
                )
                journey.need_by = journey.clock + timedelta(minutes=minutes)

    @staticmethod
    def _require_en_route(journey: Session) -> None:
        if (
            journey.ride is None
            or journey.ride.state != RideState.DRIVER_EN_ROUTE
            or journey.state not in {JourneyState.MONITORING, JourneyState.AWAITING_APPROVAL}
        ):
            raise SimulationError("INVALID_STATE", "This injection needs a driver en route.")

    def tick(self, journey_id: str, steps: int, *, session: Session | None = None) -> JourneySnapshot:
        with self._open_session(journey_id, session) as journey:
            return self._tick_session(journey, steps)

    @staticmethod
    @contextmanager
    def _open_session(
        journey_id: str,
        session: Session | None,
        *,
        rider_id: str | None = None,
        recent_ids: tuple[str, ...] = (),
    ) -> Iterator[Session]:
        if session is None:
            with open_ride(journey_id, rider_id=rider_id, recent_ids=recent_ids) as journey:
                yield journey
            return

        # Hosted catch-up already owns the database transaction. Standalone
        # simulations also use this path for sessions outside the store.
        if session.id != journey_id or rider_id is not None or recent_ids:
            raise ValueError("An explicit session must match the journey and manage its own booking guard")
        with store.lock:
            yield session

    def _tick_session(self, journey: Session, steps: int) -> JourneySnapshot:
        history: TelemetryHistory | None = None
        for _ in range(steps):
            journey.clock += timedelta(seconds=5)
            if not journey.ride or journey.state in STOPPED or journey.state == JourneyState.RECONCILING:
                continue
            if journey.ride.state == RideState.DRIVER_ARRIVED:
                continue
            journey.ride_ticks += 1
            adapter = journey.adapters[journey.ride.provider]
            script = script_for(journey.scenario, profiled=not journey.provider_overrides.scripted)
            injections = script.at_tick(journey.ride_ticks, journey.ride_count)
            if any(item.kind == "DRIVER_CANCEL" for item in injections):
                self._driver_cancel(journey)
                continue
            if script.arrival_tick is not None and journey.ride_ticks >= script.arrival_tick:
                self._arrive(journey)
                continue
            driver = journey.driver_sim
            if driver is None or driver.ride_id != journey.ride.ride_id:
                driver = self._create_driver_sim(journey)
            if history is None or history.ride_id != driver.ride_id:
                history = TelemetryHistory(
                    driver.ride_id, driver.history, initial_distance_m=round(driver.initial_distance_m)
                )
            for injection in injections:
                if injection.kind == "FORCE_MODE":
                    driver.force_mode(
                        MotionMode(injection.params["mode"]), injection.params.get("duration_ticks")
                    )
            sample = driver.tick(journey.clock, adapter.profile, adapter.rng)
            if driver.cancelled:
                self._driver_cancel(journey)
                continue
            if sample is None:
                journey.ride.gps_quality = GpsQuality.POOR
            else:
                history.append(sample)
                journey.ride.distance_to_pickup_m = sample.distance_to_pickup_m
                journey.ride.eta_sec = sample.eta_sec
                journey.ride.last_position_at = sample.observed_at
                journey.ride.gps_quality = sample.gps_quality
            history.prune(journey.clock)
            # StoredSession already saves DriverSim.history. Keep that copy bounded.
            driver.history[:] = history
            features, journey.risk = self.intelligence.assess(
                history,
                journey.ride,
                journey.clock,
                journey.need_by,
                journey.driver_chat_signal,
                journey.risk_tracker,
            )
            # Retain legacy persisted counters for older readers, without using them as inputs.
            journey.stationary_ticks = int(features.stationary_duration_s // 5)
            journey.eta_delta_s = features.eta_delta_s_120s
            if sample is None:
                journey.add_event(EventType.RISK_UPDATED, journey.risk, journey.ride.ride_id)
                continue
            # The legacy telemetry event carries only these sample fields.
            journey.add_event(
                EventType.TELEMETRY_UPDATED,
                {
                    "distance_to_pickup_m": sample.distance_to_pickup_m,
                    "eta_sec": sample.eta_sec,
                    "gps_quality": sample.gps_quality,
                    "is_simulated": True,
                },
                sample.ride_id,
            )
            if (
                journey.risk.band in {RiskBand.MEDIUM, RiskBand.HIGH}
                and journey.risk.band not in journey.explained_bands
            ):
                journey.risk.explanation_source = "deterministic_template"
                journey.explained_bands.add(journey.risk.band)
                journey.add_event(
                    EventType.EXPLANATION_VERIFIED,
                    {"source": journey.risk.explanation_source, "numbers_checked_against_telemetry": True},
                    journey.ride.ride_id,
                )
            journey.add_event(EventType.RISK_UPDATED, journey.risk, journey.ride.ride_id)
            for injection in injections:
                if injection.kind == "DRIVER_MESSAGE":
                    self._classify_driver_message(journey, injection.params["text"])
            if (
                journey.risk.band in {RiskBand.HIGH, RiskBand.MEDIUM}
                and not journey.pending_backup
                and journey.recovery_attempts < journey.policy.max_recovery_attempts
            ):
                candidates = self._backups(journey)
                if candidates:
                    assessment = self._evaluate_backup(journey, journey.ride, candidates[0])
                    journey.decision = assessment
                    journey.add_event(EventType.DEADLINE_DECISION, assessment, journey.ride.ride_id)
                    if assessment.recommendation == "PROPOSE_SWITCH":
                        journey.pending_backup = candidates[0]
                        journey.cancellation_fee_notice = self._fee_notice(journey)
                        self._transition_journey(
                            journey,
                            JourneyState.AWAITING_APPROVAL,
                            reason="A preemptive switch requires rider approval.",
                        )
                        journey.add_event(
                            EventType.BACKUP_FOUND,
                            {"candidate": journey.pending_backup},
                            journey.ride.ride_id,
                        )
                        journey.add_event(
                            EventType.APPROVAL_REQUIRED,
                            {
                                "reason": "Deadline-aware switching proposal; rider approval required",
                                "cancellation_fee_notice": journey.cancellation_fee_notice,
                            },
                            journey.ride.ride_id,
                        )
                else:
                    journey.add_event(
                        EventType.RECOVERY_BLOCKED, {"reason": "No eligible backup"}, journey.ride.ride_id
                    )
            if journey.ride.distance_to_pickup_m <= 0:
                self._arrive(journey)
        return self._checked_snapshot(journey)

    def _refresh_backup(self, journey: Session, quote: Quote) -> Quote | None:
        """A fresh simulated search/select/init BEFORE touching the current booking."""
        unavailable = journey.backup_unavailable_stage == "refresh" or bool(
            script_for(journey.scenario).injections_for("BACKUP_UNAVAILABLE", stage="refresh")
        )
        if unavailable:
            journey.provider_overrides.reject_next_init.add(quote.provider)
        refreshed = journey._search(quote.provider)
        if not journey.adapters[quote.provider].init(refreshed, journey.clock) or (
            refreshed.estimated_fare_inr > journey.policy.max_total_fare_inr
        ):
            reason = (
                "Backup disappeared during search; original kept"
                if unavailable
                else "Quote no longer eligible"
            )
            journey.add_event(EventType.QUOTE_REFRESH_FAILED, {"reason": reason})
            return None
        journey.quotes = [refreshed if q.provider == refreshed.provider else q for q in journey.quotes]
        journey.add_event(EventType.QUOTE_REFRESHED, {"candidate": refreshed, "not_a_reservation": True})
        return refreshed

    def _fee_notice(self, journey: Session) -> FeeNotice:
        fare = next(
            (
                q.estimated_fare_inr
                for q in journey.quotes
                if journey.ride and q.quote_id == journey.ride.quote_id
            ),
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

    def _evaluate_backup(self, journey: Session, ride: Ride, candidate: Quote) -> DeadlineDecision:
        fee = self._fee_notice(journey)
        current_fare = next((q.estimated_fare_inr for q in journey.quotes if q.quote_id == ride.quote_id), 0)
        return self.intelligence.decide(
            now=journey.clock,
            need_by=journey.need_by,
            current_eta_sec=ride.eta_sec,
            backup_eta_sec=candidate.pickup_eta_sec,
            current_fare_inr=current_fare,
            backup_fare_inr=candidate.estimated_fare_inr,
            cancellation_fee_upper_bound_inr=fee.potential_fee_upper_bound_inr,
            risk_band=journey.risk.band if journey.risk else RiskBand.UNKNOWN,
            chat_signal=journey.driver_chat_signal.label if journey.driver_chat_signal else None,
        )

    def _message(self, journey: Session, text: str) -> JourneySnapshot:
        self._classify_driver_message(journey, text)
        return self._checked_snapshot(journey)

    def _classify_driver_message(self, journey: Session, text: str) -> None:
        if not journey.ride or journey.state in STOPPED:
            raise SimulationError("INVALID_STATE", "No active driver conversation.")
        journey.driver_chat_signal = self.intelligence.classify_message(
            text, offline=journey.deterministic and not getattr(journey, "demo_live_llm", False)
        )
        journey.add_event(
            EventType.DRIVER_MESSAGE_CLASSIFIED,
            {"message": text[:300], "signal": journey.driver_chat_signal},
            journey.ride.ride_id,
        )
        # Never cancel from driver chat. Advice can elevate attention, not permissions.
        if journey.driver_chat_signal.label == ChatLabel.REQUEST_RIDER_CANCEL:
            journey.add_event(
                EventType.RISK_SIGNAL_ADDED,
                {"signal": "driver_requests_rider_cancellation", "advisory_only": True},
                journey.ride.ride_id,
            )

    def _checked_snapshot(self, journey: Session) -> JourneySnapshot:
        snapshot = journey.snapshot()
        check_invariants(snapshot)
        return snapshot

    def _transition_journey(self, journey: Session, target: JourneyState, *, reason: str) -> None:
        if target == journey.state:
            return
        journey.state = transition_journey(journey.state, target, reason=reason)
        if target in STOPPED:
            journey.pending_backup = None

    def _validate_version(self, journey: Session, expected_version: int | None):
        if expected_version is not None and expected_version != journey.version:
            raise SimulationError(
                "STALE_JOURNEY_VERSION", "Refresh journey state before acting.", retryable=True
            )

    def _idempotent(
        self, journey: Session, operation: str, key: str, body: dict, action: Callable[[], JourneySnapshot]
    ) -> JourneySnapshot:
        request_hash = fingerprint({"idempotency_key": key, **body})
        record = journey._idempotency_store.get(journey.id, key)
        if record is not None:
            return record.replay(operation, request_hash)

        # Legacy hosted payloads recorded the command and failure but had no response snapshot.
        legacy = journey.idempotency.get(key)
        if legacy is not None:
            (legacy_operation, argument, version), failure = legacy
            if operation != legacy_operation:
                raise key_reused()
            legacy_body = {"expected_version": version} if operation != "driver_message" else {}
            legacy_body["idempotency_key"] = key
            argument_name = {"book": "quote_id", "approve_switch": "approved", "driver_message": "text"}
            if operation in argument_name:
                legacy_body[argument_name[operation]] = argument
            legacy_hash = fingerprint(legacy_body)
            if request_hash != legacy_hash:
                raise key_reused()
            record = IdempotencyRecord(
                operation=operation,
                request_hash=legacy_hash,
                response=FailureResponse(code=failure[0], message=failure[1])
                if failure
                else journey.snapshot(),
            )
            journey._idempotency_store.put(journey.id, key, record)
            return record.replay(operation, request_hash)

        before = journey.version
        try:
            response = action()
        except SimulationError as error:
            # Rejected preconditions can be corrected and retried. Preserve applied failures.
            if journey.version != before or error.code in {"BOOKING_FAILED", "BOOKING_UNCONFIRMED"}:
                record = IdempotencyRecord(
                    operation=operation, request_hash=request_hash, response=FailureResponse.from_error(error)
                )
                journey._idempotency_store.put(journey.id, key, record)
            raise
        record = IdempotencyRecord(operation=operation, request_hash=request_hash, response=response)
        journey._idempotency_store.put(journey.id, key, record)
        return response

    def _book_primary(self, journey: Session, quote_id: str, expected_version: int | None) -> JourneySnapshot:
        if journey._booking_guard is not None:
            journey._booking_guard()
        self._validate_version(journey, expected_version)
        return self._book(journey, quote_id, replacement=False)

    def _book(self, journey: Session, quote_id: str, *, replacement: bool) -> JourneySnapshot:
        if journey.state in STOPPED:
            raise SimulationError("INVALID_STATE", "Journey is no longer accepting bookings.")
        if journey.booking_uncertain or journey.state == JourneyState.RECONCILING:
            raise SimulationError("BOOKING_UNCONFIRMED", "Prior booking outcome needs reconciliation.")
        if journey.ride and journey.ride.state in ACTIVE_RIDE_STATES:
            raise SimulationError(
                "ACTIVE_RIDE_EXISTS", "Cancel and verify existing ride before booking another."
            )
        if journey.ride_count > 0 and not replacement:
            raise SimulationError(
                "INVALID_STATE", "Additional bookings must use the bounded recovery workflow."
            )
        quote = next((q for q in journey.quotes if q.quote_id == quote_id), None)
        if not quote:
            raise SimulationError("QUOTE_NOT_FOUND", "Quote is missing or expired.", retryable=True)
        if quote.estimated_fare_inr > journey.policy.max_total_fare_inr:
            raise SimulationError("POLICY_FARE_LIMIT", "Ride exceeds the user-approved fare limit.")
        if journey.clock >= quote.expires_at:
            raise SimulationError("QUOTE_EXPIRED", "Request an updated quote.", retryable=True)
        count = journey.ride_count + 1
        proposal = Ride(
            ride_id=f"ride_{count}_{journey.id}",
            journey_id=journey.id,
            provider=quote.provider,
            quote_id=quote_id,
            state=transition_ride(
                RideState.CONFIRMED, RideState.DRIVER_EN_ROUTE, reason="Provider confirmed the booking."
            ),
            booked_at=journey.clock,
            driver_id=f"SIM_DRIVER_{count}",
            distance_to_pickup_m=script_for(
                journey.scenario, profiled=not journey.provider_overrides.scripted
            ).profile_overrides.get("distance_m", 2200),
            eta_sec=quote.pickup_eta_sec,
            last_position_at=journey.clock,
            cancellation_fee_inr=None,
            gps_quality=GpsQuality.GOOD,
            is_simulated=True,
        )
        adapter = journey.adapters[quote.provider]
        if not replacement and not adapter.init(quote, journey.clock):
            raise SimulationError(
                "BOOKING_FAILED", "The simulated provider refused the booking.", retryable=True
            )
        result = adapter.confirm(quote, journey.clock, proposal)
        if result.status == OpStatus.FAILED:
            raise SimulationError(
                "BOOKING_FAILED", "The simulated provider refused the booking.", retryable=True
            )
        if result.status == OpStatus.UNKNOWN:
            journey.unconfirmed_ride = proposal
            journey.booking_uncertain = True
            self._transition_journey(journey, JourneyState.RECONCILING, reason="Booking result is unknown.")
            journey.add_event(
                EventType.ERROR,
                {
                    "code": "BOOKING_UNCONFIRMED",
                    "message": "Booking result unknown. Do not retry automatically.",
                },
            )
            self._checked_snapshot(journey)
            raise SimulationError("BOOKING_UNCONFIRMED", "Booking response timed out; verification required.")
        journey.ride_count += 1
        journey.ride_ticks = 0
        journey.stall_ticks_remaining = 0
        journey.stationary_ticks = 0
        journey.eta_delta_s = 0
        journey.risk = None
        journey.pending_backup = None
        journey.decision = None
        journey.driver_chat_signal = None
        journey.explained_bands.clear()
        journey.cancellation_fee_notice = None
        journey.ride = result.ride
        assert journey.ride is not None
        self._create_driver_sim(journey)
        self._transition_journey(journey, JourneyState.MONITORING, reason="Provider confirmed the booking.")
        journey.attempted_providers.add(quote.provider)
        journey.add_event(
            EventType.RIDE_CONFIRMED,
            {"ride": journey.ride.model_copy(), "replacement": replacement},
            journey.ride.ride_id,
        )
        if replacement:
            journey.add_event(
                EventType.RECOVERY_SUCCEEDED,
                {"attempt": journey.recovery_attempts, "provider": quote.provider},
                journey.ride.ride_id,
            )
        return self._checked_snapshot(journey)

    def _backups(self, journey: Session) -> list[Quote]:
        provider = (
            journey.ride.provider
            if journey.ride
            else (journey.last_ride.provider if journey.last_ride else None)
        )
        if journey.backup_unavailable_stage == "search" or script_for(journey.scenario).injections_for(
            "BACKUP_UNAVAILABLE", stage="search"
        ):
            return []
        return self.intelligence.rank_backups(
            journey.quotes,
            excluding_provider=provider,
            max_fare_inr=journey.policy.max_total_fare_inr,
            attempted_providers=journey.attempted_providers,
        )

    def _confirm_replacement(self, journey: Session, candidate: Quote) -> JourneySnapshot:
        permitted, reason = self.intelligence.may_rebook(
            journey_state=journey.state,
            active_ride_state=journey.ride.state if journey.ride else None,
            attempts=journey.recovery_attempts,
            max_attempts=journey.policy.max_recovery_attempts,
            quote_fare_inr=candidate.estimated_fare_inr,
            max_fare_inr=journey.policy.max_total_fare_inr,
            original_cancel_confirmed=journey.last_ride is not None
            and journey.last_ride.state in {RideState.DRIVER_CANCELLED, RideState.RIDER_CANCELLED},
        )
        if not permitted:
            journey.add_event(EventType.RECOVERY_BLOCKED, {"reason": reason})
            self._clear_proposal(journey, "Recovery policy refused the replacement.")
            return self._checked_snapshot(journey)
        journey.recovery_attempts += 1
        self._transition_journey(
            journey, JourneyState.RECOVERING, reason="Recovery policy allowed the replacement."
        )
        journey.add_event(
            EventType.RECOVERY_STARTED, {"attempt": journey.recovery_attempts, "candidate": candidate}
        )
        try:
            return self._book(journey, candidate.quote_id, replacement=True)
        except SimulationError as exc:
            if journey.state == JourneyState.RECONCILING:
                return self._checked_snapshot(journey)
            self._transition_journey(
                journey, JourneyState.EXHAUSTED, reason="Replacement booking failed after cancellation."
            )
            journey.add_event(
                EventType.RECOVERY_EXHAUSTED, {"reason": exc.code, "original_cancellation_confirmed": True}
            )
            return self._checked_snapshot(journey)

    def _recover_after_cancel(self, journey: Session):
        if journey.state == JourneyState.USER_CANCELLED:
            return
        if journey.recovery_attempts >= journey.policy.max_recovery_attempts:
            self._transition_journey(
                journey, JourneyState.EXHAUSTED, reason="Recovery attempt limit reached."
            )
            journey.add_event(EventType.RECOVERY_EXHAUSTED, {"reason": "POLICY_RETRY_LIMIT"})
            return
        candidates = self._backups(journey)
        if not candidates:
            self._transition_journey(
                journey, JourneyState.EXHAUSTED, reason="No eligible backup after driver cancellation."
            )
            journey.add_event(
                EventType.RECOVERY_EXHAUSTED,
                {"reason": "No eligible backup under fare and availability rules"},
            )
            return
        candidate = None
        for ranked in candidates:
            candidate = self._refresh_backup(journey, ranked)
            if candidate is not None:
                break
        if not candidate:
            self._transition_journey(
                journey, JourneyState.EXHAUSTED, reason="No fresh backup after driver cancellation."
            )
            journey.add_event(
                EventType.RECOVERY_EXHAUSTED, {"reason": "No fresh backup after driver cancellation"}
            )
            return
        if not journey.policy.auto_rebook_on_confirmed_driver_cancel:
            journey.pending_backup = candidate
            self._transition_journey(
                journey,
                JourneyState.AWAITING_APPROVAL,
                reason="A replacement after driver cancellation requires approval.",
            )
            journey.add_event(EventType.BACKUP_FOUND, {"candidate": candidate})
            journey.add_event(
                EventType.APPROVAL_REQUIRED, {"reason": "Driver cancelled; approve a replacement booking."}
            )
            return
        self._confirm_replacement(journey, candidate)

    def _driver_cancel(self, journey: Session) -> None:
        if not journey.ride or journey.state in STOPPED or journey.state == JourneyState.RECONCILING:
            return
        cancelled = journey.ride.model_copy()
        journey.ride.state = transition_ride(
            journey.ride.state, RideState.DRIVER_CANCELLED, reason="Driver cancelled the ride."
        )
        journey.adapters[journey.ride.provider].update_ride(journey.ride)
        journey.last_ride = journey.ride.model_copy()
        journey.add_event(EventType.DRIVER_CANCELLED, {"provider": cancelled.provider}, cancelled.ride_id)
        journey.ride = None
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        journey.decision = None
        self._recover_after_cancel(journey)
        self._checked_snapshot(journey)

    def _create_driver_sim(self, journey: Session) -> DriverSim:
        adapter = journey.adapters[journey.ride.provider]
        scripted = journey.provider_overrides.scripted
        journey.driver_sim = DriverSim.create(
            journey.ride.ride_id,
            journey.pickup,
            adapter.profile,
            adapter.rng,
            distance_m=journey.ride.distance_to_pickup_m,
            speed_mps=150 / 5 if scripted else None,
            sampled=not scripted,
        )
        journey.driver_sim.traffic_multiplier = (
            journey.ride.eta_sec
            * journey.driver_sim.current_speed_mps
            / max(1, journey.ride.distance_to_pickup_m)
        )
        if journey.ride.last_position_at == journey.ride.booked_at:
            lat, lng = journey.driver_sim.route[0]
            journey.driver_sim.history.append(
                TelemetrySample(
                    ride_id=journey.ride.ride_id,
                    observed_at=journey.ride.booked_at,
                    distance_to_pickup_m=journey.ride.distance_to_pickup_m,
                    eta_sec=journey.ride.eta_sec,
                    lat=lat,
                    lng=lng,
                    gps_quality=journey.ride.gps_quality,
                )
            )
        return journey.driver_sim

    def _arrive(self, journey: Session):
        if not journey.ride or journey.ride.state == RideState.DRIVER_ARRIVED:
            return
        journey.ride.state = transition_ride(
            journey.ride.state, RideState.DRIVER_ARRIVED, reason="Driver reached the pickup point."
        )
        journey.adapters[journey.ride.provider].update_ride(journey.ride)
        journey.ride.distance_to_pickup_m = 0
        journey.ride.eta_sec = 0
        journey.ride.last_position_at = journey.clock
        self._transition_journey(
            journey, JourneyState.MONITORING, reason="Driver arrival superseded the switch proposal."
        )
        journey.risk = None
        journey.decision = None
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        journey.add_event(
            EventType.DRIVER_ARRIVED, {"message": "Simulated driver reached pickup."}, journey.ride.ride_id
        )

    def _approve_switch(
        self, journey: Session, approved: bool, expected_version: int | None
    ) -> JourneySnapshot:
        self._validate_version(journey, expected_version)
        if not journey.pending_backup or journey.state != JourneyState.AWAITING_APPROVAL:
            raise SimulationError("INVALID_STATE", "No switch approval is pending.")
        if not journey.ride and (
            not journey.last_ride or journey.last_ride.state != RideState.DRIVER_CANCELLED
        ):
            raise SimulationError("CANCEL_UNCONFIRMED", "Cannot confirm original cancellation.")
        if not approved:
            reason = "Rider chose to keep waiting." if journey.ride else "Rider declined replacement."
            journey.add_event(EventType.SWITCH_REJECTED, {"reason": reason})
            self._clear_proposal(journey, reason)
            return self._checked_snapshot(journey)
        if journey.recovery_attempts >= journey.policy.max_recovery_attempts:
            journey.add_event(EventType.RECOVERY_BLOCKED, {"reason": "POLICY_RETRY_LIMIT"})
            self._clear_proposal(journey, "Recovery attempt limit reached.")
            return self._checked_snapshot(journey)

        # Refresh provider offer before any rider-side cancellation.
        candidate = self._refresh_backup(journey, journey.pending_backup)
        if candidate is None:
            self._clear_proposal(journey, "The refreshed backup is unavailable.")
            return self._checked_snapshot(journey)
        if journey.ride:
            journey.cancellation_fee_notice = self._fee_notice(journey)
            if (
                journey.cancellation_fee_notice.potential_fee_upper_bound_inr
                > journey.policy.max_cancellation_fee_inr
            ):
                journey.add_event(EventType.RECOVERY_BLOCKED, {"reason": "CANCELLATION_FEE_LIMIT"})
                self._clear_proposal(journey, "Cancellation fee limit would be exceeded.")
                return self._checked_snapshot(journey)
        journey.add_event(
            EventType.SWITCH_APPROVED,
            {"new_provider": candidate.provider, "cancellation_fee_notice": journey.cancellation_fee_notice},
        )
        if journey.ride:
            self._cancel_active_ride(journey, journey.ride)

        # A refreshed quote is not a reservation. Providers may still reject confirm.
        replacement_results = script_for(journey.scenario).injections_for(
            "FORCE_CONFIRM_RESULT", stage="replacement"
        )
        if replacement_results:
            journey.provider_overrides.next_confirm[candidate.provider] = OpStatus(
                replacement_results[0].params["result"]
            )
            try:
                return self._book(journey, candidate.quote_id, replacement=True)
            except SimulationError as error:
                if error.code != "BOOKING_FAILED":
                    raise
            journey.add_event(
                EventType.REPLACEMENT_QUOTE_LOST,
                {"reason": "Illustrative race after confirmed original cancellation"},
            )
            self._clear_proposal(journey, "Replacement quote was lost after cancellation.")
            return self._checked_snapshot(journey)
        return self._confirm_replacement(journey, candidate)

    def _clear_proposal(self, journey: Session, reason: str) -> None:
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        self._transition_journey(
            journey, JourneyState.MONITORING if journey.ride else JourneyState.EXHAUSTED, reason=reason
        )

    def _cancel_active_ride(self, journey: Session, ride: Ride) -> None:
        ride_state = transition_ride(
            ride.state, RideState.RIDER_CANCELLED, reason="Rider requested cancellation."
        )
        payload = {"old_provider": ride.provider}
        journey.add_event(EventType.RIDE_CANCEL_REQUESTED, payload, ride.ride_id)
        result = journey.adapters[ride.provider].cancel(ride.ride_id)
        if result.status == OpStatus.UNKNOWN:
            self._transition_journey(
                journey, JourneyState.RECONCILING, reason="Cancellation result is unknown."
            )
            journey.pending_backup = None
            journey.cancellation_fee_notice = None
        if result.status != OpStatus.CONFIRMED:
            raise SimulationError("CANCEL_UNCONFIRMED", "Provider cancellation confirmation missing.")
        self._record_confirmed_cancel(journey, ride, ride_state)

    def _record_confirmed_cancel(
        self, journey: Session, ride: Ride, ride_state: RideState = RideState.RIDER_CANCELLED
    ) -> None:
        ride.state = ride_state
        journey.last_ride = ride.model_copy()
        journey.ride = None
        journey.add_event(EventType.RIDE_CANCEL_CONFIRMED, {"old_provider": ride.provider}, ride.ride_id)

    def _cancel(self, journey: Session, expected_version: int | None) -> JourneySnapshot:
        self._validate_version(journey, expected_version)
        if journey.state == JourneyState.USER_CANCELLED:
            return self._checked_snapshot(journey)
        stopped_state = transition_journey(
            journey.state, JourneyState.USER_CANCELLED, reason="Rider stopped the journey."
        )
        ride = journey.ride or journey.unconfirmed_ride
        if ride:
            if journey.state != JourneyState.RECONCILING:
                self._cancel_active_ride(journey, ride)
            else:
                status = journey.adapters[ride.provider].status(ride.ride_id)
                if status and status.state == RideState.RIDER_CANCELLED:
                    self._record_confirmed_cancel(journey, ride)
                elif journey.unconfirmed_ride is not None and status and status.state in ACTIVE_RIDE_STATES:
                    self._cancel_active_ride(journey, ride)
        journey.state = stopped_state
        journey.unconfirmed_ride = None
        journey.booking_uncertain = False
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        journey.add_event(EventType.USER_CANCELLED, {"message": "Rider stopped the journey."})
        return self._checked_snapshot(journey)

    def _confirm_pickup(
        self,
        journey: Session,
        expected_version: int | None,
        boarded_at: datetime | None,
        trip_duration: Callable[[Location, Location], timedelta] | None,
    ) -> JourneySnapshot:
        self._validate_version(journey, expected_version)
        if not journey.ride or journey.ride.state != RideState.DRIVER_ARRIVED:
            raise SimulationError("INVALID_STATE", "Confirm pickup only after driver arrives.")
        duration = trip_duration(journey.pickup, journey.dropoff) if trip_duration else None
        if duration is not None and boarded_at is None:
            boarded_at = datetime.now(UTC)
        ride_state = transition_ride(
            journey.ride.state, RideState.IN_PROGRESS, reason="Passenger boarded the ride after arrival."
        )
        self._transition_journey(
            journey, JourneyState.PICKUP_CONFIRMED, reason="Passenger boarded the arrived ride."
        )
        journey.ride.state = ride_state
        journey.adapters[journey.ride.provider].update_ride(journey.ride)
        journey.boarded_at = boarded_at
        journey.arrives_at = boarded_at + duration if boarded_at and duration else None
        journey.destination_speed = 20 if journey.arrives_at else None
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        journey.add_event(
            EventType.PICKUP_CONFIRMED, {"message": "Passenger boarded simulated ride."}, journey.ride.ride_id
        )
        return self._checked_snapshot(journey)
