from datetime import UTC, datetime, timedelta

from app.schemas.enums import RideState
from app.schemas.requests import JourneyCreate
from app.simulation.durable import StoredSession, advance
from app.simulation.engine import LOCATIONS, Session


def test_tracking_and_booking_survive_storage_roundtrip():
    session = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    quote = session.quotes[0]
    version = session.version
    session.book(quote.quote_id, "storage-test", expected_version=version)
    payload = StoredSession.model_validate(vars(session)).model_dump_json()
    restored = StoredSession.model_validate_json(payload).restore()
    assert restored.snapshot() == session.snapshot()
    assert restored.book(quote.quote_id, "storage-test", expected_version=version) == session.snapshot()

    started = datetime(2026, 11, 24, tzinfo=UTC)
    assert advance(restored, None, started) == started
    assert advance(restored, started, started + timedelta(seconds=11)) == started + timedelta(seconds=10)
    assert restored.ride_ticks == 2
    assert restored.version > session.version
    assert advance(restored, started + timedelta(seconds=10), started + timedelta(minutes=5)) is None
    assert restored.ride.state == RideState.DRIVER_ARRIVED


def test_stalled_pickup_advances_without_moving_the_driver():
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    session = Session(request, scenario="S03")
    session.book(session.quotes[0].quote_id, "stall-test")
    distance = session.ride.distance_to_pickup_m
    started = datetime(2026, 11, 24, tzinfo=UTC)

    assert advance(session, started, started + timedelta(seconds=20)) == started + timedelta(seconds=20)
    assert session.ride_ticks == 4
    assert session.stationary_ticks == 4
    assert session.ride.distance_to_pickup_m == distance


def test_boarding_timestamp_survives_storage_and_idempotent_retries():
    session = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    session.book(session.quotes[0].quote_id, "book-trip")
    session.tick(24)
    boarded_at = datetime(2026, 11, 24, tzinfo=UTC)
    duration = timedelta(seconds=90)
    session.confirm_pickup("board-trip", boarded_at=boarded_at, trip_duration=lambda *_: duration)

    payload = StoredSession.model_validate(vars(session)).model_dump()
    restored = StoredSession.model_validate(payload).restore()
    assert restored.snapshot().boarded_at == boarded_at
    assert restored.snapshot().arrives_at == boarded_at + duration
    retry = restored.confirm_pickup("board-trip", boarded_at=boarded_at + timedelta(minutes=1))
    assert retry.boarded_at == boarded_at
    assert retry.arrives_at == boarded_at + duration
    del payload["boarded_at"]
    del payload["arrives_at"]
    assert StoredSession.model_validate(payload).restore().snapshot().boarded_at is None
    assert StoredSession.model_validate(payload).restore().snapshot().arrives_at is None
