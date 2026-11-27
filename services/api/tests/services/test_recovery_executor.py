from datetime import timedelta

import pytest

from app.domain.errors import SimulationError
from app.schemas.enums import OpStatus, RideState
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, Session


def booked(scenario="S03", **policy):
    j = Session(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], policy=RecoveryPolicy(**policy)),
        scenario=scenario,
    )
    j.book(j.quotes[0].quote_id, "book")
    return j


def restore(j):
    return StoredSession.model_validate_json(
        StoredSession.model_validate(vars(j)).model_dump_json()
    ).restore()


def proposal(scenario="S03", **policy):
    j = booked(scenario, **policy)
    j.tick(25)
    assert j.pending_backup
    return j


def test_stale_approval_never_contacts_provider():
    j = proposal()
    events = list(j.events)
    with pytest.raises(SimulationError, match="Refresh journey state"):
        j.approve_switch(True, "old", expected_version=j.version - 1)
    assert j.events == events


@pytest.mark.parametrize("block", ["fee", "cooldown", "over_cap", "missing"])
def test_recheck_before_cancelling(block):
    j = proposal()
    old = j.ride.ride_id
    provider = j.pending_backup.provider
    if block == "fee":
        j.policy.max_cancellation_fee_inr = 0
    elif block == "cooldown":
        j.provider_cooldowns[provider] = j.clock
    elif block == "over_cap":
        j.provider_overrides.quote_offers[provider] = (9999, 90)
    else:
        j.provider_overrides.reject_next_init.add(provider)
    j.approve_switch(True, "approve")
    assert j.ride.ride_id == old
    assert j.recovery_attempts == 0
    assert "RIDE_CANCEL_REQUESTED" not in [e.type for e in j.events]
    assert j.events[-1].type == (
        "QUOTE_REFRESH_FAILED" if block in {"missing", "over_cap"} else "RECOVERY_BLOCKED"
    )


def test_failed_cancel_keeps_original():
    j = proposal()
    old = j.ride
    j.provider_overrides.next_cancel[old.provider] = OpStatus.FAILED
    j.approve_switch(True, "approve")
    assert j.ride == old and j.state == "MONITORING"
    assert j.events[-1].payload["reason"] == "CANCEL_FAILED"


def test_s17_unknown_cancel_survives_reload_and_continues():
    j = proposal("S17")
    j.approve_switch(True, "approve")
    assert j.verification.step == "switch_cancel"
    assert not j.recovery_attempts
    j = restore(j)
    j.tick(1)
    assert j.ride and j.state == "MONITORING"
    types = [e.type for e in j.events]
    assert (
        types.index("RECONCILED") < types.index("RIDE_CANCEL_CONFIRMED") < types.index("RECOVERY_SUCCEEDED")
    )


@pytest.mark.parametrize("accepted", [True, False])
def test_unknown_replacement_has_one_confirm_per_attempt(accepted):
    j = proposal()
    provider = j.pending_backup.provider
    j.provider_overrides.next_confirm[provider] = OpStatus.UNKNOWN
    j.approve_switch(True, "approve")
    uncertain = j.unconfirmed_ride
    assert uncertain and j.ride is None
    if accepted:
        j.provider_states[provider].rides[uncertain.ride_id] = RideState.DRIVER_EN_ROUTE
    j = restore(j)
    j.tick(1)
    assert (j.ride.provider == provider) == accepted
    assert j.recovery_attempts == (1 if accepted else 2)
    key = f"{j.id}:attempt:1:{provider.value}"
    assert list(j.provider_states[provider].confirmations) == [key]
    assert (provider in j.provider_cooldowns) != accepted
    assert j.events[-1].type == "RECOVERY_SUCCEEDED"


def test_six_unavailable_statuses_stop_automatic_verification():
    j = proposal("S17")
    j.approve_switch(True, "approve")
    for _ in range(6):
        j = restore(j)
        j.adapters[j.ride.provider].status = lambda _: None
        j.tick(1)
    assert j.events[-1].payload["reason"] == "VERIFICATION_REQUIRED"
    seq = j.last_seq()
    j = restore(j)
    j.tick(20)
    assert j.verification.tries == 6 and j.last_seq() == seq
    assert j.state == "RECONCILING" and j.recovery_attempts == 0


def test_user_stop_supersedes_uncertain_switch():
    j = proposal("S17")
    j.approve_switch(True, "approve")
    j.cancel("stop")
    j = restore(j)
    seq = j.last_seq()
    j.tick(10)
    assert j.state == "USER_CANCELLED" and j.last_seq() == seq and j.verification is None


def test_all_failed_candidates_are_counted_and_cooled():
    j = proposal("S15")
    j.approve_switch(True, "approve")
    assert j.recovery_attempts == 2 and j.state == "EXHAUSTED"
    failed = [provider for provider, state in j.provider_states.items() if state.confirmations]
    assert len(failed) == 2
    assert all(j.clock - j.provider_cooldowns[p] < timedelta(seconds=1) for p in failed)
    assert j.events[-1].type == "RECOVERY_EXHAUSTED"


def test_declined_replacement_after_driver_cancel_is_terminal():
    j = proposal("S04")
    j.approve_switch(False, "reject")
    assert j.state == "EXHAUSTED" and j.ride is None
    assert j.events[-1].payload["reason"] == "RIDER_DECLINED_REPLACEMENT"
