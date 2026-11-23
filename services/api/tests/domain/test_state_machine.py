from itertools import product

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domain.errors import SimulationError
from app.domain.invariants import check_invariants
from app.domain.state_machine import (
    JOURNEY_TRANSITIONS,
    RIDE_TRANSITIONS,
    transition_journey,
    transition_ride,
)
from app.schemas.domain import OperationResult
from app.schemas.enums import EventType, JourneyState, OpStatus, Provider, RideState
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.simulation.engine import LOCATIONS, Session
from app.simulation.providers import ADAPTERS

TERMINAL = (JourneyState.PICKUP_CONFIRMED, JourneyState.USER_CANCELLED, JourneyState.EXHAUSTED)


@pytest.mark.parametrize(
    ("transition", "current", "target"),
    [
        (transition, current, target)
        for transition, table in (
            (transition_journey, JOURNEY_TRANSITIONS),
            (transition_ride, RIDE_TRANSITIONS),
        )
        for current, targets in table.items()
        for target in sorted(targets)
    ],
)
def test_every_listed_transition_succeeds(transition, current, target):
    assert transition(current, target, reason="test") is target


@pytest.mark.parametrize(("current", "target"), list(product(TERMINAL, JourneyState)))
def test_terminal_journey_rejects_every_target(current, target):
    with pytest.raises(SimulationError, match="test transition") as error:
        transition_journey(current, target, reason="test transition")
    assert error.value.code == "INVALID_STATE"


def test_transition_tables_are_immutable():
    for table, state in (
        (JOURNEY_TRANSITIONS, JourneyState.CREATED),
        (RIDE_TRANSITIONS, RideState.CONFIRMED),
    ):
        assert isinstance(table[state], frozenset)
        with pytest.raises(TypeError):
            table[state] = frozenset()


def test_reconciling_only_allows_resolution_or_rider_stop():
    assert JOURNEY_TRANSITIONS[JourneyState.RECONCILING] == {
        JourneyState.MONITORING,
        JourneyState.EXHAUSTED,
        JourneyState.USER_CANCELLED,
    }


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (RideState.DRIVER_EN_ROUTE, RideState.IN_PROGRESS),
        (RideState.DRIVER_CANCELLED, RideState.DRIVER_EN_ROUTE),
    ],
)
def test_invalid_ride_moves(current, target):
    with pytest.raises(SimulationError) as error:
        transition_ride(current, target, reason="test")
    assert error.value.code == "INVALID_STATE"


@given(st.sampled_from(JourneyState), st.lists(st.sampled_from(JourneyState), min_size=1, max_size=100))
def test_terminal_journey_states_are_absorbing(start, targets):
    current = start
    terminal = start if start in TERMINAL else None
    for target in targets:
        try:
            current = transition_journey(current, target, reason="generated move")
        except SimulationError as exc:
            assert exc.code == "INVALID_STATE"
        if terminal is not None:
            assert current is terminal
        elif current in TERMINAL:
            terminal = current


def make_session(scenario="S01", **policy):
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], policy=RecoveryPolicy(**policy))
    return Session(request, scenario=scenario)


def test_pickup_requires_an_arrived_ride():
    session = make_session()
    session.book(session.quotes[0].quote_id, "book")
    before = session.snapshot().model_dump()
    with pytest.raises(SimulationError) as error:
        session.confirm_pickup("early")
    assert error.value.code == "INVALID_STATE"
    assert session.snapshot().model_dump() == before

    session.tick(25)
    picked_up = session.confirm_pickup("arrived")
    assert picked_up.state is JourneyState.PICKUP_CONFIRMED
    assert picked_up.active_ride.state is RideState.IN_PROGRESS


def test_unknown_booking_requires_reconciliation():
    session = make_session("S12")
    for key in ("book", "retry"):
        with pytest.raises(SimulationError) as error:
            session.book(session.quotes[0].quote_id, key)
        assert error.value.code == "BOOKING_UNCONFIRMED"
        assert session.state is JourneyState.RECONCILING
        assert session.ride is None
    assert session.booking_uncertain
    assert session.events[-1].type is EventType.ERROR
    assert session.tick(2).state is JourneyState.RECONCILING
    assert session.cancel("stop").state is JourneyState.USER_CANCELLED


def test_unknown_cancellation_preserves_original_ride(monkeypatch):
    session = make_session("S15")
    original = session.book(session.quotes[0].quote_id, "book").active_ride
    session.tick(25)
    monkeypatch.setattr(
        ADAPTERS[Provider.PROVIDER_A], "cancel", lambda ride: OperationResult(status=OpStatus.UNKNOWN)
    )
    with pytest.raises(SimulationError) as error:
        session.approve_switch(True, "approve")
    assert error.value.code == "CANCEL_UNCONFIRMED"
    assert session.state is JourneyState.RECONCILING
    assert session.tick(2).active_ride.ride_id == original.ride_id
    assert session.ride.state is RideState.DRIVER_EN_ROUTE
    assert session.recovery_attempts == 0
    assert session.events[-1].type is EventType.RIDE_CANCEL_REQUESTED
    with pytest.raises(SimulationError, match="No switch approval is pending"):
        session.approve_switch(True, "retry")

    for key in ("stop", "stop-again"):
        stopped = session.cancel(key)
        assert stopped.state is JourneyState.USER_CANCELLED
        assert stopped.active_ride.state is RideState.DRIVER_EN_ROUTE
        assert stopped.pending_backup is None


def test_unknown_replacement_booking_stays_reconciling(monkeypatch):
    session = make_session("S03")
    session.book(session.quotes[0].quote_id, "book")
    session.tick(25)
    monkeypatch.setattr(
        ADAPTERS[session.pending_backup.provider],
        "confirm",
        lambda quote, now: OperationResult(status=OpStatus.UNKNOWN),
    )
    result = session.approve_switch(True, "approve")
    assert result.state is JourneyState.RECONCILING
    assert result.active_ride is None
    assert result.last_ride.state is RideState.RIDER_CANCELLED
    assert result.booking_uncertain


def test_exhaustion_clears_backup_and_blocks_late_cancel():
    session = make_session("S03", max_recovery_attempts=0)
    session.book(session.quotes[0].quote_id, "book")
    session.tick(25)
    assert session.pending_backup is not None
    exhausted = session.approve_switch(True, "approve")
    assert exhausted.state is JourneyState.EXHAUSTED
    assert exhausted.pending_backup is None
    with pytest.raises(SimulationError) as error:
        session.cancel("late")
    assert error.value.code == "INVALID_STATE"
    assert session.snapshot() == exhausted


def test_rejecting_backup_after_driver_cancellation_keeps_legacy_monitoring_state():
    session = make_session("S04", auto_rebook_on_confirmed_driver_cancel=False)
    session.book(session.quotes[0].quote_id, "book")
    assert session.tick(8).state is JourneyState.AWAITING_APPROVAL
    rejected = session.approve_switch(False, "reject")
    assert rejected.state is JourneyState.MONITORING
    assert rejected.active_ride is None
    assert rejected.pending_backup is None


def test_snapshot_invariants_detect_invalid_mutations():
    session = make_session(max_recovery_attempts=1)
    snapshot = session.book(session.quotes[0].quote_id, "book")
    check_invariants(snapshot)
    cases = (
        ({"last_ride": snapshot.active_ride.model_copy(update={"ride_id": "second"})}, "one active ride"),
        ({"state": JourneyState.EXHAUSTED, "pending_backup": snapshot.quotes[0]}, "pending backup"),
        ({"recovery_attempts": 2}, "attempt cap"),
        ({"policy": RecoveryPolicy(max_total_fare_inr=1)}, "fare cap"),
        ({"quotes": []}, "no fare quote"),
    )
    for changes, message in cases:
        with pytest.raises(AssertionError, match=message):
            check_invariants(snapshot.model_copy(update=changes))
