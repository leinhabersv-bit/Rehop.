"""Deterministic, testable guardrails. An AI suggestion cannot bypass these checks."""

from __future__ import annotations

STOPPED = {"PICKUP_CONFIRMED", "USER_CANCELLED", "EXHAUSTED"}
ACTIVE_RIDE_STATES = {"CONFIRMED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "IN_PROGRESS"}


def may_rebook(
    *,
    journey_state: str,
    active_ride_state: str | None,
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
