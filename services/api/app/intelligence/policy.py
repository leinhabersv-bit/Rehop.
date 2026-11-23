"""Deterministic, testable guardrails. An AI suggestion cannot bypass these checks."""

from __future__ import annotations

from app.domain.state_machine import ACTIVE_RIDE_STATES as ACTIVE_RIDE_STATES
from app.domain.state_machine import TERMINAL_JOURNEY_STATES as STOPPED
from app.schemas.enums import JourneyState, RideState


def may_rebook(
    *,
    journey_state: JourneyState,
    active_ride_state: RideState | None,
    attempts: int,
    max_attempts: int,
    quote_fare_inr: int,
    max_fare_inr: int,
    original_cancel_confirmed: bool,
) -> tuple[bool, str]:
    if journey_state in STOPPED:
        return False, "JOURNEY_STOPPED"
    if active_ride_state in ACTIVE_RIDE_STATES or not original_cancel_confirmed:
        return False, "CANCEL_UNCONFIRMED"
    if attempts >= max_attempts:
        return False, "POLICY_RETRY_LIMIT"
    if quote_fare_inr > max_fare_inr:
        return False, "POLICY_FARE_LIMIT"
    return True, "OK"
