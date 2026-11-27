"""Run a recovery under JourneyService's lock and persist at provider uncertainty boundaries."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.domain.errors import SimulationError
from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.schemas.domain import PendingVerification, Quote, Ride
from app.schemas.enums import DecisionType, EventType, JourneyState, OpStatus, RideState
from app.simulation.scenarios import script_for

if TYPE_CHECKING:
    from app.services.journey_service import JourneyService
    from app.simulation.engine import Session


class RecoveryExecutor:
    def __init__(self, service: JourneyService, expected_version: int | None = None):
        self.service = service
        self.expected_version = expected_version

    def _ready(self, journey: Session) -> bool:
        return journey.state not in TERMINAL_JOURNEY_STATES and journey.verification is None

    def _checked_version(self, journey: Session, expected: int) -> None:
        self.service._validate_version(journey, expected)
        journey.add_event(EventType.RECOVERY_CHECKED, {"step": "version", "version": expected})

    def _blocked(self, journey: Session, reason: str) -> None:
        journey.add_event(EventType.RECOVERY_BLOCKED, {"reason": reason})
        self.service._clear_proposal(journey, reason)

    def _exhaust(self, journey: Session, reason: str) -> None:
        self.service._transition_journey(journey, JourneyState.EXHAUSTED, reason=reason)
        journey.add_event(EventType.RECOVERY_EXHAUSTED, {"reason": reason})

    def _eligible(self, journey: Session, candidate: Quote) -> bool:
        if journey.recovery_attempts >= journey.policy.max_recovery_attempts:
            self._blocked(journey, "POLICY_RETRY_LIMIT")
            return False
        previous = journey.ride or journey.last_ride
        ranked = self.service.intelligence.rank_backups(
            [candidate],
            now=journey.clock,
            policy=journey.policy,
            excluding_provider=previous.provider if previous else None,
            attempted_providers=journey.attempted_providers,
            provider_cooldowns=journey.provider_cooldowns,
        )
        if not ranked.quotes:
            self._blocked(journey, "NO_ELIGIBLE_BACKUP")
            return False
        if journey.ride:
            notice = self.service._fee_notice(journey)
            if notice.potential_fee_upper_bound_inr > journey.policy.max_cancellation_fee_inr:
                self._blocked(journey, "CANCELLATION_FEE_LIMIT")
                return False
            journey.cancellation_fee_notice = notice
        journey.add_event(EventType.RECOVERY_CHECKED, {"step": "limits", "provider": candidate.provider})
        return True

    def execute_approved_switch(self, journey: Session, candidate: Quote) -> None:
        self.service._validate_version(journey, self.expected_version)
        if not self._ready(journey) or journey.state != JourneyState.AWAITING_APPROVAL:
            return
        self._checked_version(journey, journey.version)
        candidate = self.service._refresh_backup(journey, candidate)
        if candidate is None:
            self.service._clear_proposal(journey, "The refreshed backup is unavailable.")
            return
        if not self._eligible(journey, candidate):
            return
        decision_version = journey.version
        decision = self.service._decision(journey, [candidate])
        self.service._validate_version(journey, decision_version)
        if decision.type not in {DecisionType.REQUEST_APPROVAL, DecisionType.REBOOK_AFTER_CANCEL}:
            self._blocked(journey, decision.reasons[0])
            return
        ride = journey.ride
        journey.add_event(
            EventType.SWITCH_APPROVED,
            {
                "new_provider": candidate.provider,
                "cancellation_fee_notice": journey.cancellation_fee_notice,
            },
        )
        if ride:
            journey.add_event(EventType.RIDE_CANCEL_REQUESTED, {"old_provider": ride.provider}, ride.ride_id)
            outcome = journey.adapters[ride.provider].cancel(ride.ride_id)
            if outcome.status == OpStatus.UNKNOWN:
                self.suspend(journey, "switch_cancel", ride, candidate)
                return
            if outcome.status == OpStatus.FAILED:
                self._blocked(journey, "CANCEL_FAILED")
                return
            self.service._record_confirmed_cancel(journey, ride)
        self._confirm(journey, candidate)

    def after_driver_cancel(self, journey: Session) -> None:
        remaining = self.service._backups(journey)
        while self._ready(journey):
            self.expected_version = journey.version
            decision = self.service._decision(journey, remaining)
            if decision.candidate is None:
                self._exhaust(journey, next(iter(decision.reasons), "NO_ELIGIBLE_BACKUP"))
                return
            if decision.type == DecisionType.REBOOK_AFTER_CANCEL:
                if self.execute_rebook_after_cancel(journey, decision.candidate):
                    return
            elif decision.type == DecisionType.REQUEST_APPROVAL:
                candidate = self.service._refresh_backup(journey, decision.candidate)
                if candidate:
                    journey.pending_backup = candidate
                    self.service._transition_journey(
                        journey, JourneyState.AWAITING_APPROVAL, reason="Rider approval required."
                    )
                    journey.add_event(EventType.BACKUP_FOUND, {"candidate": candidate})
                    journey.add_event(
                        EventType.APPROVAL_REQUIRED,
                        {"reason": "Driver cancelled; approve a replacement booking."},
                    )
                    return
            else:
                return
            remaining.remove(decision.candidate)

    def execute_rebook_after_cancel(self, journey: Session, candidate: Quote) -> bool:
        self.service._validate_version(journey, self.expected_version)
        if (
            not self._ready(journey)
            or journey.ride
            or not journey.last_ride
            or journey.last_ride.state != RideState.DRIVER_CANCELLED
            or not journey.policy.auto_rebook_on_confirmed_driver_cancel
        ):
            return True
        self._checked_version(
            journey, self.expected_version if self.expected_version is not None else journey.version
        )
        refreshed = self.service._refresh_backup(journey, candidate)
        if refreshed is None:
            return False
        if self._eligible(journey, refreshed):
            self._confirm(journey, refreshed)
        return True

    def _confirm(self, journey: Session, candidate: Quote) -> None:
        if not self._ready(journey):
            return
        permitted, reason = self.service.intelligence.may_rebook(
            journey_state=journey.state,
            active_ride_state=journey.ride.state if journey.ride else None,
            attempts=journey.recovery_attempts,
            max_attempts=journey.policy.max_recovery_attempts,
            quote_fare_inr=candidate.estimated_fare_inr,
            max_fare_inr=journey.policy.max_total_fare_inr,
            original_cancel_confirmed=bool(
                journey.last_ride
                and journey.last_ride.state in {RideState.RIDER_CANCELLED, RideState.DRIVER_CANCELLED}
            ),
        )
        if not permitted:
            self._blocked(journey, reason)
            return
        journey.recovery_attempts += 1
        self.service._transition_journey(
            journey, JourneyState.RECOVERING, reason="Sending replacement confirmation."
        )
        journey.add_event(
            EventType.RECOVERY_STARTED, {"attempt": journey.recovery_attempts, "candidate": candidate}
        )
        script = script_for(journey.scenario, profiled=not journey.provider_overrides.scripted)
        for injection in script.injections_for("FORCE_CONFIRM_RESULT", stage="replacement"):
            journey.provider_overrides.next_confirm[candidate.provider] = OpStatus(injection.params["result"])
        try:
            self.service._book(journey, candidate.quote_id, replacement=True)
        except SimulationError as error:
            if error.code == "BOOKING_FAILED":
                self._failed(journey, candidate)
            elif error.code != "BOOKING_UNCONFIRMED":
                raise

    def _failed(self, journey: Session, candidate: Quote) -> None:
        journey.provider_cooldowns[candidate.provider] = journey.clock
        journey.attempted_providers.add(candidate.provider)
        journey.add_event(
            EventType.REPLACEMENT_QUOTE_LOST,
            {"reason": "Replacement confirmation failed after confirmed original cancellation"},
        )
        if journey.recovery_attempts < journey.policy.max_recovery_attempts:
            for backup in self.service._backups(journey):
                refreshed = self.service._refresh_backup(journey, backup)
                if refreshed and self._eligible(journey, refreshed):
                    self._confirm(journey, refreshed)
                    return
                if not self._ready(journey):
                    return
        self._exhaust(journey, "BOOKING_FAILED")

    def suspend(self, journey: Session, step: str, ride: Ride, candidate: Quote | None = None) -> None:
        journey.verification = PendingVerification(
            step=step, ride=ride, candidate=candidate, stop_requested=step == "user_cancel"
        )
        journey.pending_backup = None
        journey.cancellation_fee_notice = None
        self.service._transition_journey(
            journey, JourneyState.RECONCILING, reason="Provider outcome unknown."
        )
        journey.add_event(
            EventType.RECONCILIATION_REQUIRED, {"step": step, "reason": "OUTCOME_UNKNOWN"}, ride.ride_id
        )

    def reconcile(self, journey: Session) -> None:
        tx = journey.verification
        if tx is None:
            # Sessions saved before P11 have only the uncertain ride, without a switch authorization.
            ride = journey.unconfirmed_ride or journey.ride
            if not ride:
                return
            self.suspend(
                journey,
                ("replacement" if journey.recovery_attempts else "primary")
                if journey.unconfirmed_ride
                else "user_cancel",
                ride,
                next((q for q in journey.quotes if q.quote_id == ride.quote_id), None),
            )
            tx = journey.verification
        if tx.tries >= 6:
            return
        tx.tries += 1
        status = journey.adapters[tx.ride.provider].status(tx.ride.ride_id)
        if status is None:
            if tx.tries == 6:
                journey.add_event(
                    EventType.RECONCILIATION_REQUIRED,
                    {"step": tx.step, "reason": "VERIFICATION_REQUIRED"},
                    tx.ride.ride_id,
                )
            return
        journey.add_event(EventType.RECONCILED, {"step": tx.step, "outcome": status.state}, tx.ride.ride_id)
        journey.verification = None
        journey.booking_uncertain = False
        journey.unconfirmed_ride = None
        active = status.state in ACTIVE_RIDE_STATES
        if tx.stop_requested:
            if active:
                journey.ride = tx.ride
                journey.ride.state = status.state
                journey.add_event(EventType.RECOVERY_BLOCKED, {"reason": "CANCEL_FAILED"})
            elif status.state in {RideState.DRIVER_CANCELLED, RideState.RIDER_CANCELLED}:
                self.service._record_confirmed_cancel(journey, tx.ride, status.state)
            self.service._transition_journey(
                journey, JourneyState.USER_CANCELLED, reason="Rider stopped recovery."
            )
            journey.add_event(EventType.USER_CANCELLED, {"message": "Rider stopped the journey."})
            return
        if tx.step == "switch_cancel":
            self.service._transition_journey(
                journey, JourneyState.MONITORING, reason="Original cancellation verified."
            )
            if active:
                journey.ride = tx.ride
                journey.ride.state = status.state
                self._blocked(journey, "CANCEL_FAILED")
                return
            self.service._record_confirmed_cancel(journey, tx.ride, RideState.RIDER_CANCELLED)
            candidate = self.service._refresh_backup(journey, tx.candidate)
            if candidate and self._eligible(journey, candidate):
                self._confirm(journey, candidate)
            elif candidate is None:
                self._exhaust(journey, "QUOTE_REFRESH_FAILED")
        elif active:
            tx.ride.state = status.state
            self.service._adopt(journey, tx.ride, replacement=tx.step == "replacement")
        elif tx.step == "replacement":
            self.service._transition_journey(
                journey, JourneyState.MONITORING, reason="Replacement failure verified."
            )
            self._failed(journey, tx.candidate)
        else:
            self._exhaust(journey, "BOOKING_FAILED")
