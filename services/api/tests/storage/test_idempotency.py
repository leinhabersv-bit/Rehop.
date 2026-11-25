import pytest

from app.domain.errors import SimulationError
from app.schemas.requests import JourneyCreate
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, Session
from app.storage.idempotency import fingerprint


def test_fingerprint_has_canonical_object_order():
    first = {"quote_id": "quote_a", "params": {"b": 2, "a": 1}}
    second = {"params": {"a": 1, "b": 2}, "quote_id": "quote_a"}
    assert len(fingerprint(first)) == 64
    assert fingerprint(first) == fingerprint(second)
    assert fingerprint(first) != fingerprint({**first, "quote_id": "quote_b"})


@pytest.mark.parametrize(
    "operation", ["book", "approve_switch", "cancel", "confirm_pickup", "driver_message"]
)
def test_mutations_replay_stored_response_and_reject_changed_body_or_operation(operation, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    session = Session(request, scenario="S03" if operation == "approve_switch" else "S01")
    quote_id = session.quotes[0].quote_id
    if operation != "book":
        session.book(quote_id, "initial-book")
    if operation in {"approve_switch", "confirm_pickup"}:
        session.tick(25)
    version = session.version
    key = "retry-key"
    if operation == "book":
        args, conflict_args = (quote_id, key), (session.quotes[1].quote_id, key)
    elif operation == "approve_switch":
        args, conflict_args = (True, key), (False, key)
    elif operation == "driver_message":
        args, conflict_args = ("Traffic, 10 min", key), ("On my way", key)
    else:
        args = conflict_args = (key,)
    kwargs = {} if operation == "driver_message" else {"expected_version": version}
    conflicting_kwargs = (
        {"expected_version": version + 1} if operation in {"cancel", "confirm_pickup"} else kwargs
    )
    original = getattr(session, operation)(*args, **kwargs).model_dump(mode="json")
    session.tick(5)
    assert session.snapshot().model_dump(mode="json") != original
    events = session.list_events()
    assert getattr(session, operation)(*args, **kwargs).model_dump(mode="json") == original
    assert session.list_events() == events
    with pytest.raises(SimulationError) as body_error:
        getattr(session, operation)(*conflict_args, **conflicting_kwargs)
    with pytest.raises(SimulationError) as operation_error:
        if operation == "cancel":
            session.book(quote_id, key)
        else:
            session.cancel(key)
    for error in (body_error.value, operation_error.value):
        assert (error.code, error.status) == ("IDEMPOTENCY_KEY_REUSED", 409)
    other_journey = Session(request)
    assert other_journey.book(other_journey.quotes[0].quote_id, key).active_ride_id


def test_payload_round_trip_keeps_events_and_original_response():
    session = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    quote = session.quotes[0].quote_id
    version = session.version
    original = session.book(quote, "book", expected_version=version).model_dump(mode="json")
    session.tick(15)
    payload = StoredSession.model_validate(vars(session)).model_dump_json()
    restored = StoredSession.model_validate_json(payload).restore()
    assert [event.model_dump(mode="json") for event in restored.list_events()] == [
        event.model_dump(mode="json") for event in session.list_events()
    ]
    assert restored.book(quote, "book", expected_version=version).model_dump(mode="json") == original
