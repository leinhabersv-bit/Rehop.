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
from app.services.journey_service import JourneyService
from app.simulation.engine import LOCATIONS, Session

service = JourneyService()

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
    service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    before = session.snapshot().model_dump()
    with pytest.raises(SimulationError) as error:
        service.confirm_pickup(session.id, "early", session=session)
    assert error.value.code == "INVALID_STATE"
    assert session.snapshot().model_dump() == before

    service.tick(session.id, 25, session=session)
    picked_up = service.confirm_pickup(session.id, "arrived", session=session)
    assert picked_up.state is JourneyState.PICKUP_CONFIRMED
    assert picked_up.active_ride.state is RideState.IN_PROGRESS


def test_unknown_booking_requires_reconciliation():
    session = make_session("S12")
    for key in ("book", "retry"):
        with pytest.raises(SimulationError) as error:
            service.book(session.id, session.quotes[0].quote_id, key, session=session)
        assert error.value.code == "BOOKING_UNCONFIRMED"
        assert session.state is JourneyState.RECONCILING
        assert session.ride is None
    assert session.booking_uncertain
    assert session.events[-1].type is EventType.RECONCILIATION_REQUIRED
    assert service.tick(session.id, 2, session=session).state is JourneyState.EXHAUSTED
    assert session.events[-2].type is EventType.RECONCILED
    assert session.events[-2].payload["outcome"] == "FAILED"


def test_unknown_cancellation_preserves_original_ride(monkeypatch):
    session = make_session("S15")
    original = service.book(session.id, session.quotes[0].quote_id, "book", session=session).active_ride
    service.tick(session.id, 25, session=session)
    monkeypatch.setattr(
        session.adapters[Provider.PROVIDER_A],
        "cancel",
        lambda ride_id: OperationResult(status=OpStatus.UNKNOWN),
    )
    service.approve_switch(session.id, True, "approve", session=session)
    assert session.state is JourneyState.RECONCILING
    assert service.tick(session.id, 1, session=session).active_ride.ride_id == original.ride_id
    assert session.ride.state is RideState.DRIVER_EN_ROUTE
    assert session.recovery_attempts == 0
    assert any(
        e.type == EventType.RECONCILED and e.payload["outcome"] == "DRIVER_EN_ROUTE" for e in session.events
    )
    with pytest.raises(SimulationError, match="No switch approval is pending"):
        service.approve_switch(session.id, True, "retry", session=session)

    monkeypatch.undo()
    for key in ("stop", "stop-again"):
        stopped = service.cancel(session.id, key, session=session)
        assert stopped.state is JourneyState.USER_CANCELLED
        assert stopped.active_ride is None
        assert stopped.pending_backup is None


def test_unknown_replacement_booking_stays_reconciling(monkeypatch):
    session = make_session("S03")
    service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    service.tick(session.id, 25, session=session)
    monkeypatch.setattr(
        session.adapters[session.pending_backup.provider],
        "confirm",
        lambda quote, now, ride: OperationResult(status=OpStatus.UNKNOWN),
    )
    result = service.approve_switch(session.id, True, "approve", session=session)
    assert result.state is JourneyState.RECONCILING
    assert result.active_ride is None
    assert result.last_ride.state is RideState.RIDER_CANCELLED
    assert result.booking_uncertain


def test_retry_limit_keeps_original_ride_and_blocks_preemptive_switch(monkeypatch):
    session = make_session("S03", max_recovery_attempts=0)
    original = service.book(session.id, session.quotes[0].quote_id, "book", session=session).active_ride_id
    snapshot = service.tick(session.id, 25, session=session)
    assert snapshot.pending_backup is None
    assert snapshot.active_ride_id == original
    assert snapshot.state is JourneyState.MONITORING

    session.policy.max_recovery_attempts = 1
    assert service.tick(session.id, 1, session=session).pending_backup is not None
    session.policy.max_recovery_attempts = 0

    def should_not_cancel(ride_id):
        pytest.fail(f"Retry limit cannot cancel {ride_id}")

    monkeypatch.setattr(session.adapters[Provider.PROVIDER_A], "cancel", should_not_cancel)
    blocked = service.approve_switch(session.id, True, "approve", session=session)
    assert blocked.active_ride_id == original
    assert blocked.state is JourneyState.MONITORING
    assert blocked.pending_backup is None
    assert session.events[-1].type is EventType.RECOVERY_BLOCKED


def test_exhaustion_clears_backup_and_blocks_late_cancel():
    session = make_session("S15")
    service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    service.tick(session.id, 25, session=session)
    assert session.pending_backup is not None
    exhausted = service.approve_switch(session.id, True, "approve", session=session)
    assert exhausted.state is JourneyState.EXHAUSTED
    assert exhausted.pending_backup is None
    with pytest.raises(SimulationError) as error:
        service.cancel(session.id, "late", session=session)
    assert error.value.code == "INVALID_STATE"
    assert session.snapshot() == exhausted


def test_default_recovery_requires_approval_and_declining_closes_unbooked_journey():
    session = make_session("S04")
    service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    assert service.tick(session.id, 8, session=session).state is JourneyState.AWAITING_APPROVAL
    rejected = service.approve_switch(session.id, False, "reject", session=session)
    assert rejected.state is JourneyState.EXHAUSTED
    assert rejected.active_ride is None
    assert rejected.pending_backup is None


def test_driver_cancellation_tries_next_ranked_quote_when_fastest_is_unavailable(monkeypatch):
    session = make_session("S04", auto_rebook_on_confirmed_driver_cancel=True)
    original = service.book(session.id, session.quotes[0].quote_id, "book", session=session).active_ride_id
    monkeypatch.setattr(session.adapters[Provider.PROVIDER_B], "init", lambda quote, now: False)

    result = service.tick(session.id, 8, session=session)

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
    original = service.book(session.id, session.quotes[0].quote_id, "book", session=session).active_ride_id
    calls = []

    def provider_cancel(ride_id):
        calls.append(ride_id)
        return OperationResult(status=OpStatus.UNKNOWN)

    monkeypatch.setattr(session.adapters[Provider.PROVIDER_A], "cancel", provider_cancel)
    version = session.version
    for _ in range(2):
        with pytest.raises(SimulationError) as error:
            service.cancel(session.id, "cancel", expected_version=version, session=session)
        assert error.value.code == "CANCEL_UNCONFIRMED"
    assert calls == [original]
    assert session.state is JourneyState.RECONCILING
    assert session.snapshot().active_ride_id == original
    assert EventType.RIDE_CANCEL_CONFIRMED not in [event.type for event in session.events]


def test_client_key_cannot_preempt_scenario_driver_message(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    session = make_session("S13")
    service.book(session.id, session.quotes[0].quote_id, f"injected_chat_{session.id}", session=session)
    result = service.tick(session.id, 5, session=session)
    assert result.driver_chat_signal.label == "REQUEST_RIDER_CANCEL"
    assert result.state is JourneyState.MONITORING


@pytest.mark.parametrize(
    ("status", "state"),
    [(OpStatus.FAILED, JourneyState.EXHAUSTED), (OpStatus.UNKNOWN, JourneyState.RECONCILING)],
)
def test_automatic_replacement_failure_does_not_stick_in_recovering(monkeypatch, status, state):
    session = make_session("S04", auto_rebook_on_confirmed_driver_cancel=True, max_recovery_attempts=1)
    service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    monkeypatch.setattr(
        session.adapters[Provider.PROVIDER_B],
        "confirm",
        lambda quote, now, ride: OperationResult(status=status),
    )
    result = service.tick(session.id, 10, session=session)
    assert result.state is state
    assert result.active_ride is None
    assert result.last_ride.state is RideState.DRIVER_CANCELLED
    assert result.booking_uncertain is (status is OpStatus.UNKNOWN)
    assert result.recovery_attempts == 1


def test_snapshot_invariants_detect_invalid_mutations():
    session = make_session(max_recovery_attempts=1)
    snapshot = service.book(session.id, session.quotes[0].quote_id, "book", session=session)
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
