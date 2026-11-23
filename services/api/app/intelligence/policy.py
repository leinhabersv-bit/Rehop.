"""Deterministic, testable guardrails. An AI suggestion cannot bypass these checks."""

from __future__ import annotations

from app.schemas.enums import JourneyState, RideState

STOPPED = {JourneyState.PICKUP_CONFIRMED, JourneyState.USER_CANCELLED, JourneyState.EXHAUSTED}
ACTIVE_RIDE_STATES = {
    RideState.CONFIRMED,
    RideState.DRIVER_EN_ROUTE,
    RideState.DRIVER_ARRIVED,
    RideState.IN_PROGRESS,
}


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
