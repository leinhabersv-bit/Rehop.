import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.errors import SimulationError
from app.schemas.enums import EventType, JourneyState
from app.schemas.requests import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation import durable
from app.simulation.engine import LOCATIONS, Session
from app.simulation.replay import replay_from_events
from app.storage.event_store import MemoryEventStore, PostgresEventStore

service = JourneyService()

SCHEMA = Path(__file__).resolve().parents[2] / "deploy" / "schema.sql"


@pytest.fixture
def hosted_database(monkeypatch, steady_provider_profiles):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is unset; a Postgres test database is required")

    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    schema_name = f"test_p03_{uuid4().hex}"
    schema = sql.Identifier(schema_name)
    with psycopg.connect(url) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(schema))
        admin.commit()
        try:
            monkeypatch.setenv("DATABASE_URL", make_conninfo(url, options=f"-c search_path={schema_name}"))
            monkeypatch.setattr(durable, "HOSTED", True)
            monkeypatch.delenv("OPENAI_API_KEY", raising=False)
            with durable.database() as connection:
                connection.execute(SCHEMA.read_text(encoding="utf-8"))
            yield
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(schema))


def test_postgres_and_memory_event_store_parity(hosted_database):
    memory = MemoryEventStore()
    now = datetime(2026, 11, 25, tzinfo=UTC)
    ids = ("journey_a", "journey_b")
    with durable.database() as connection:
        connection.execute("INSERT INTO ride_journeys (id, payload) VALUES (%s, '{}'), (%s, '{}')", ids)
        postgres = PostgresEventStore(connection)
        for index in range(30):
            args = (
                ids[index % 2],
                EventType.TELEMETRY_UPDATED,
                {"index": index, "is_simulated": True},
                "ride",
                now + timedelta(seconds=5 * index),
            )
            assert postgres.append(*args) == memory.append(*args)

    def append_on_new_connection(index):
        with durable.database() as connection:
            return PostgresEventStore(connection).append(
                ids[0], EventType.TELEMETRY_UPDATED, {"index": index}, "ride", now
            )

    with ThreadPoolExecutor(max_workers=4) as workers:
        concurrent = list(workers.map(append_on_new_connection, range(30, 42)))
    with durable.database() as connection:
        postgres = PostgresEventStore(connection)
        for event in sorted(concurrent, key=lambda event: event.seq):
            assert event == memory.append(event.journey_id, event.type, event.payload, event.ride_id, now)
        for journey_id in ids:
            assert postgres.last_seq(journey_id) == memory.last_seq(journey_id)
            assert postgres.list(journey_id, 10) == memory.list(journey_id, 10)
            assert postgres.list(journey_id) == memory.list(journey_id)


def assert_event_copies(journey_id):
    with durable.database() as connection:
        payload = connection.execute(
            "SELECT payload FROM ride_journeys WHERE id = %s", (journey_id,)
        ).fetchone()[0]
        events = PostgresEventStore(connection).list(journey_id)
        assert [event.model_dump(mode="json") for event in events] == payload["events"]
    return events


def test_hosted_mutations_keep_event_copies_identical_and_replay_responses(hosted_database, monkeypatch):
    now = datetime(2026, 11, 25, tzinfo=UTC)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    monkeypatch.setattr(durable, "datetime", Clock)
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    stalled = durable.create_ride(request, scenario="S03")
    rider_id = str(uuid4())
    assert_event_copies(stalled.id)
    with durable.open_ride(stalled.id, rider_id=rider_id) as session:
        initial = service.book(
            session.id, session.quotes[0].quote_id, "book", expected_version=stalled.version, session=session
        )
    assert_event_copies(stalled.id)
    competing = durable.create_ride(request)
    assert_event_copies(competing.id)
    with (
        pytest.raises(SimulationError, match="already have an active ride"),
        durable.open_ride(competing.id, rider_id=rider_id) as session,
    ):
        service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    assert_event_copies(competing.id)

    with durable.open_ride(stalled.id) as session:
        service.driver_message(session.id, "Traffic, 10 min", "message", session=session)
    assert_event_copies(stalled.id)
    now += timedelta(seconds=125)
    with durable.open_ride(stalled.id) as session:
        assert session.state == JourneyState.AWAITING_APPROVAL
    assert_event_copies(stalled.id)
    with durable.open_ride(stalled.id) as session:
        service.approve_switch(session.id, True, "approve", session=session)
    assert_event_copies(stalled.id)
    now += timedelta(seconds=125)
    with durable.open_ride(stalled.id) as session:
        service.confirm_pickup(session.id, "board", session=session)
    events = assert_event_copies(stalled.id)
    assert replay_from_events(stalled.id).state == JourneyState.PICKUP_CONFIRMED
    with durable.open_ride(stalled.id, rider_id=rider_id) as session:
        assert (
            service.book(
                session.id,
                session.quotes[0].quote_id,
                "book",
                expected_version=stalled.version,
                session=session,
            )
            == initial
        )
    assert assert_event_copies(stalled.id) == events
    with (
        pytest.raises(SimulationError, match="different request") as error,
        durable.open_ride(stalled.id) as session,
    ):
        service.cancel(session.id, "book", session=session)
    assert error.value.code == "IDEMPOTENCY_KEY_REUSED"
    assert assert_event_copies(stalled.id) == events
    with durable.open_ride(competing.id, rider_id=rider_id) as session:
        service.book(session.id, session.quotes[0].quote_id, "book", session=session)
    assert_event_copies(competing.id)
    with durable.open_ride(competing.id) as session:
        service.cancel(session.id, "cancel", session=session)
    assert_event_copies(competing.id)


def test_hosted_events_and_response_roll_back_with_payload(hosted_database, monkeypatch):
    session = durable.create_ride(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    events = assert_event_copies(session.id)
    sync = PostgresEventStore.sync_payload

    def fail_after_append(*args):
        sync(*args)
        raise RuntimeError("forced failure after SQL writes")

    with monkeypatch.context() as patch:
        patch.setattr(PostgresEventStore, "sync_payload", fail_after_append)
        with (
            pytest.raises(RuntimeError, match="forced failure"),
            durable.open_ride(session.id) as journey,
        ):
            service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    assert assert_event_copies(session.id) == events
    with durable.open_ride(session.id) as journey:
        assert journey.state == JourneyState.WAITING_FOR_RIDE
        assert service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey).active_ride_id
    assert len(assert_event_copies(session.id)) == len(events) + 1


def test_hosted_backfills_legacy_events_and_keeps_legacy_keys(hosted_database):
    from psycopg.types.json import Jsonb

    legacy = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    quote = legacy.quotes[0].quote_id
    version = legacy.version
    service.book(legacy.id, quote, "book", expected_version=version, session=legacy)
    payload = durable.StoredSession.model_validate(vars(legacy)).model_dump(mode="json")
    del payload["idempotency_records"]
    del payload["deterministic"]
    payload["idempotency"] = {"book": [["book", quote, version], None]}
    with durable.database() as connection:
        connection.execute(
            "INSERT INTO ride_journeys (id, payload) VALUES (%s, %s)", (legacy.id, Jsonb(payload))
        )
    assert replay_from_events(legacy.id).active_ride_id == legacy.ride.ride_id
    assert_event_copies(legacy.id)
    with durable.open_ride(legacy.id) as journey:
        with pytest.raises(SimulationError, match="different request"):
            service.cancel(journey.id, "book", session=journey)
        assert (
            service.book(journey.id, quote, "book", expected_version=version, session=journey)
            == legacy.snapshot()
        )
    assert_event_copies(legacy.id)


def test_hosted_playback_advances_on_requests_and_persists_pause(hosted_database, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    now = datetime(2026, 11, 25, tzinfo=UTC)
    monkeypatch.setattr(durable, "clock_now", lambda: now)
    client = TestClient(app)
    session = durable.create_ride(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]), scenario="S03")
    service.book(session.id, session.quotes[0].quote_id, "book")
    url = f"/api/v1/journeys/{session.id}"
    client.post(f"{url}/play", json={"speed": 20}).raise_for_status()
    now += timedelta(milliseconds=550)
    page = client.get(f"{url}/events").raise_for_status()
    assert [event["type"] for event in page.json()["events"]].count("TELEMETRY_UPDATED") == 2

    client.post(f"{url}/pause").raise_for_status()
    now += timedelta(seconds=10)
    unchanged = client.get(f"{url}/events", headers={"If-None-Match": page.headers["ETag"]})
    assert unchanged.status_code == 304
    with durable.open_ride(session.id) as restored:
        assert (restored.playing, restored.speed, restored.last_tick) == (False, 20, None)
    assert [event.model_dump(mode="json") for event in assert_event_copies(session.id)] == page.json()[
        "events"
    ]
