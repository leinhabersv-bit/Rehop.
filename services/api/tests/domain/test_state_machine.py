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
        session.adapters[Provider.PROVIDER_A],
        "cancel",
        lambda ride_id: OperationResult(status=OpStatus.UNKNOWN),
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
        session.adapters[session.pending_backup.provider],
        "confirm",
        lambda quote, now, ride: OperationResult(status=OpStatus.UNKNOWN),
    )
    result = session.approve_switch(True, "approve")
    assert result.state is JourneyState.RECONCILING
    assert result.active_ride is None
    assert result.last_ride.state is RideState.RIDER_CANCELLED
    assert result.booking_uncertain


def test_retry_limit_keeps_original_ride_and_blocks_preemptive_switch(monkeypatch):
    session = make_session("S03", max_recovery_attempts=0)
    original = session.book(session.quotes[0].quote_id, "book").active_ride_id
    snapshot = session.tick(25)
    assert snapshot.pending_backup is None
    assert snapshot.active_ride_id == original
    assert snapshot.state is JourneyState.MONITORING

    session.policy.max_recovery_attempts = 1
    assert session.tick(1).pending_backup is not None
    session.policy.max_recovery_attempts = 0

    def should_not_cancel(ride_id):
        pytest.fail(f"Retry limit cannot cancel {ride_id}")

    monkeypatch.setattr(session.adapters[Provider.PROVIDER_A], "cancel", should_not_cancel)
    blocked = session.approve_switch(True, "approve")
    assert blocked.active_ride_id == original
    assert blocked.state is JourneyState.MONITORING
    assert blocked.pending_backup is None
    assert session.events[-1].type is EventType.RECOVERY_BLOCKED


def test_exhaustion_clears_backup_and_blocks_late_cancel():
    session = make_session("S15")
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


def test_default_recovery_requires_approval_and_declining_closes_unbooked_journey():
    session = make_session("S04")
    session.book(session.quotes[0].quote_id, "book")
    assert session.tick(8).state is JourneyState.AWAITING_APPROVAL
    rejected = session.approve_switch(False, "reject")
    assert rejected.state is JourneyState.EXHAUSTED
    assert rejected.active_ride is None
    assert rejected.pending_backup is None


def test_driver_cancellation_tries_next_ranked_quote_when_fastest_is_unavailable(monkeypatch):
    session = make_session("S04", auto_rebook_on_confirmed_driver_cancel=True)
    original = session.book(session.quotes[0].quote_id, "book").active_ride_id
    monkeypatch.setattr(session.adapters[Provider.PROVIDER_B], "init", lambda quote, now: False)

    result = session.tick(8)

    assert result.state is JourneyState.MONITORING
    assert result.last_ride.ride_id == original
    assert result.last_ride.state is RideState.DRIVER_CANCELLED
    assert result.active_ride.provider is Provider.PROVIDER_C
    assert result.recovery_attempts == 1
    types = [event.type for event in session.events]
    assert EventType.APPROVAL_REQUIRED not in types
    assert types.index(EventType.DRIVER_CANCELLED) < types.index(EventType.QUOTE_REFRESH_FAILED)
    assert types.index(EventType.QUOTE_REFRESH_FAILED) < types.index(EventType.RECOVERY_SUCCEEDED)


def test_direct_cancel_requires_provider_confirmation_and_replays_uncertainty(monkeypatch):
    session = make_session()
    original = session.book(session.quotes[0].quote_id, "book").active_ride_id
    calls = []

    def provider_cancel(ride_id):
        calls.append(ride_id)
        return OperationResult(status=OpStatus.UNKNOWN)

    monkeypatch.setattr(session.adapters[Provider.PROVIDER_A], "cancel", provider_cancel)
    version = session.version
    for _ in range(2):
        with pytest.raises(SimulationError) as error:
            session.cancel("cancel", expected_version=version)
        assert error.value.code == "CANCEL_UNCONFIRMED"
    assert calls == [original]
    assert session.state is JourneyState.RECONCILING
    assert session.snapshot().active_ride_id == original
    assert EventType.RIDE_CANCEL_CONFIRMED not in [event.type for event in session.events]


def test_client_key_cannot_preempt_scenario_driver_message(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    session = make_session("S13")
    session.book(session.quotes[0].quote_id, f"injected_chat_{session.id}")
    result = session.tick(5)
    assert result.driver_chat_signal.label == "REQUEST_RIDER_CANCEL"
    assert result.state is JourneyState.MONITORING


@pytest.mark.parametrize(
    ("status", "state"),
    [(OpStatus.FAILED, JourneyState.EXHAUSTED), (OpStatus.UNKNOWN, JourneyState.RECONCILING)],
)
def test_automatic_replacement_failure_does_not_stick_in_recovering(monkeypatch, status, state):
    session = make_session("S04", auto_rebook_on_confirmed_driver_cancel=True)
    session.book(session.quotes[0].quote_id, "book")
    monkeypatch.setattr(
        session.adapters[Provider.PROVIDER_B],
        "confirm",
        lambda quote, now, ride: OperationResult(status=status),
    )
    result = session.tick(10)
    assert result.state is state
    assert result.active_ride is None
    assert result.last_ride.state is RideState.DRIVER_CANCELLED
    assert result.booking_uncertain is (status is OpStatus.UNKNOWN)
    assert result.recovery_attempts == 1


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
