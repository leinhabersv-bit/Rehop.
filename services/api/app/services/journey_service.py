"""Locked journey commands using the existing local and hosted persistence paths."""

from collections.abc import Callable
from datetime import datetime, timedelta

from app.domain.invariants import check_invariants
from app.domain.state_machine import TERMINAL_JOURNEY_STATES as STOPPED
from app.schemas.domain import JourneySnapshot
from app.schemas.enums import EventType, GpsQuality, JourneyState, RideState, RiskBand
from app.schemas.requests import Location
from app.simulation.durable import open_ride
from app.simulation.engine import Session, store
from app.simulation.scenarios import script_for
from app.simulation.world import MotionMode


class JourneyService:
    def book(
        self,
        journey_id: str,
        quote_id: str,
        key: str,
        *,
        expected_version: int | None = None,
        rider_id: str | None = None,
        recent_ids: tuple[str, ...] = (),
    ) -> JourneySnapshot:
        with open_ride(journey_id, rider_id=rider_id, recent_ids=recent_ids) as journey:
            result = journey._idempotent(
                "book",
                key,
                {"quote_id": quote_id, "expected_version": expected_version},
                lambda: journey._book_primary(quote_id, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def approve_switch(
        self,
        journey_id: str,
        approved: bool,
        key: str,
        *,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "approve_switch",
                key,
                {"approved": approved, "expected_version": expected_version},
                lambda: journey._approve_switch(approved, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def cancel(
        self,
        journey_id: str,
        key: str,
        *,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "cancel",
                key,
                {"expected_version": expected_version},
                lambda: journey._cancel(expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def confirm_pickup(
        self,
        journey_id: str,
        key: str,
        *,
        expected_version: int | None = None,
        boarded_at: datetime | None = None,
        trip_duration: Callable[[Location, Location], timedelta] | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "confirm_pickup",
                key,
                {"expected_version": expected_version},
                lambda: journey._confirm_pickup(expected_version, boarded_at, trip_duration),
            )
            check_invariants(journey.snapshot())
            return result

    def driver_message(self, journey_id: str, text: str, key: str) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "driver_message", key, {"text": text}, lambda: journey._message(text)
            )
            check_invariants(journey.snapshot())
            return result

    def tick(self, journey_id: str, steps: int, *, session: Session | None = None) -> JourneySnapshot:
        # Hosted catch-up supplies the session already locked by open_ride's transaction.
        if session is not None:
            with store.lock:
                return self._tick_session(session, steps)
        with open_ride(journey_id) as journey:
            return self._tick_session(journey, steps)

    @staticmethod
    def _tick_session(self, steps: int) -> JourneySnapshot:
        for _ in range(steps):
            self.clock += timedelta(seconds=5)
            if not self.ride or self.state in STOPPED or self.state == JourneyState.RECONCILING:
                continue
            if self.ride.state == RideState.DRIVER_ARRIVED:
                continue
            self.ride_ticks += 1
            adapter = self.adapters[self.ride.provider]
            script = script_for(self.scenario, profiled=not self.provider_overrides.scripted)
            injections = script.at_tick(self.ride_ticks, self.ride_count)
            if any(item.kind == "DRIVER_CANCEL" for item in injections):
                self.driver_cancel()
                continue
            if script.arrival_tick is not None and self.ride_ticks >= script.arrival_tick:
                self._arrive()
                continue
            driver = self.driver_sim
            if driver is None or driver.ride_id != self.ride.ride_id:
                driver = self._create_driver_sim()
            for injection in injections:
                if injection.kind == "FORCE_MODE":
                    driver.force_mode(
                        MotionMode(injection.params["mode"]), injection.params.get("duration_ticks")
                    )
            previous_distance = self.ride.distance_to_pickup_m
            previous_eta = self.ride.eta_sec
            sample = driver.tick(self.clock, adapter.profile, adapter.rng)
            if driver.cancelled:
                self.driver_cancel()
                continue
            if sample is None:
                self.ride.gps_quality = GpsQuality.POOR
                self.risk = self.intelligence.assess(
                    stationary_duration_s=self.stationary_ticks * 5,
                    eta_delta_s=self.eta_delta_s,
                    distance_to_pickup_m=self.ride.distance_to_pickup_m,
                    gps_age_s=int((self.clock - self.ride.last_position_at).total_seconds()),
                    gps_quality=GpsQuality.POOR,
                )
                self.add_event(EventType.RISK_UPDATED, self.risk, self.ride.ride_id)
                continue
            stationary = sample.distance_to_pickup_m == previous_distance
            self.stationary_ticks = self.stationary_ticks + 1 if stationary else 0
            delta = sample.eta_sec - previous_eta
            self.eta_delta_s = self.eta_delta_s + delta if stationary else max(0, delta)
            self.ride.distance_to_pickup_m = sample.distance_to_pickup_m
            self.ride.eta_sec = sample.eta_sec
            self.ride.last_position_at = sample.observed_at
            self.ride.gps_quality = sample.gps_quality
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
            self.risk = self.intelligence.assess(
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
                checked = self.intelligence.explain(
                    self.risk.explanation,
                    [self.ride.eta_sec, self.ride.distance_to_pickup_m],
                    offline=self.deterministic,
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
            for injection in injections:
                if injection.kind == "DRIVER_MESSAGE":
                    self._classify_driver_message(injection.params["text"])
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
