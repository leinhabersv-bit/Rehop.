import pytest

from app.domain.errors import SimulationError
from app.schemas.requests import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, Session
from app.storage.idempotency import fingerprint

service = JourneyService()


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
        service.book(session.id, quote_id, "initial-book", session=session)
    if operation in {"approve_switch", "confirm_pickup"}:
        service.tick(session.id, 25, session=session)
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
    original = getattr(service, operation)(session.id, *args, session=session, **kwargs).model_dump(
        mode="json"
    )
    service.tick(session.id, 5, session=session)
    assert session.snapshot().model_dump(mode="json") != original
    events = session.list_events()
    assert (
        getattr(service, operation)(session.id, *args, session=session, **kwargs).model_dump(mode="json")
        == original
    )
    assert session.list_events() == events
    with pytest.raises(SimulationError) as body_error:
        getattr(service, operation)(session.id, *conflict_args, session=session, **conflicting_kwargs)
    with pytest.raises(SimulationError) as operation_error:
        if operation == "cancel":
            service.book(session.id, quote_id, key, session=session)
        else:
            service.cancel(session.id, key, session=session)
    for error in (body_error.value, operation_error.value):
        assert (error.code, error.status) == ("IDEMPOTENCY_KEY_REUSED", 409)
    other_journey = Session(request)
    assert service.book(
        other_journey.id, other_journey.quotes[0].quote_id, key, session=other_journey
    ).active_ride_id


def test_payload_round_trip_keeps_events_and_original_response():
    session = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    quote = session.quotes[0].quote_id
    version = session.version
    original = service.book(session.id, quote, "book", expected_version=version, session=session).model_dump(
        mode="json"
    )
    service.tick(session.id, 15, session=session)
    payload = StoredSession.model_validate(vars(session)).model_dump_json()
    restored = StoredSession.model_validate_json(payload).restore()
    assert [event.model_dump(mode="json") for event in restored.list_events()] == [
        event.model_dump(mode="json") for event in session.list_events()
    ]
    assert (
        service.book(restored.id, quote, "book", expected_version=version, session=restored).model_dump(
            mode="json"
        )
        == original
    )
