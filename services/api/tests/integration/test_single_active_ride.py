from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import journeys
from app.schemas.enums import Provider
from app.simulation.engine import LOCATIONS, store
from app.simulation.profiles import PROFILES

pytestmark = pytest.mark.usefixtures("steady_provider_profiles")


def create_journey(client):
    response = client.post(
        "/api/v1/journeys",
        json={
            "pickup": LOCATIONS[0].model_dump(),
            "dropoff": LOCATIONS[1].model_dump(),
        },
    )
    assert response.status_code == 201
    return response.json()


def book(client, journey, rider, recent=None):
    headers = {"X-Ride-Rider": rider}
    if recent:
        headers["X-Ride-Recent"] = recent
    return client.post(
        f"/api/v1/journeys/{journey['id']}/book",
        headers=headers,
        json={
            "quote_id": journey["quotes"][0]["quote_id"],
            "idempotency_key": str(uuid4()),
            "expected_version": journey["version"],
        },
    )


def test_simultaneous_bookings_share_a_slot_until_the_ride_is_cancelled():
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as executor:
        rider = str(uuid4())
        journeys = [create_journey(client), create_journey(client)]
        responses = list(executor.map(lambda journey: book(client, journey, rider), journeys))
        assert sorted(response.status_code for response in responses) == [200, 409]
        blocked = next(response for response in responses if response.status_code == 409)
        assert blocked.json()["error"]["code"] == "ACTIVE_RIDE_EXISTS"
        active = next(response.json() for response in responses if response.status_code == 200)
        assert book(client, create_journey(client), str(uuid4())).status_code == 200
        cancelled = client.post(
            f"/api/v1/journeys/{active['id']}/cancel",
            json={
                "idempotency_key": str(uuid4()),
            },
        )
        assert cancelled.status_code == 200
        second = next(journey for journey in journeys if journey["id"] != active["id"])
        assert book(client, second, rider).status_code == 200


def test_existing_recent_ride_blocks_booking_for_a_new_browser_identifier():
    with TestClient(app) as client:
        old = create_journey(client)
        response = client.post(
            f"/api/v1/journeys/{old['id']}/book",
            json={
                "quote_id": old["quotes"][0]["quote_id"],
                "idempotency_key": str(uuid4()),
            },
        )
        assert response.status_code == 200
        another = book(client, create_journey(client), str(uuid4()), recent=old["id"])
        assert another.status_code == 409
        assert another.json()["error"]["code"] == "ACTIVE_RIDE_EXISTS"


@pytest.fixture
def fast_boarded_pickup(monkeypatch, steady_provider_profiles):
    # This slot test advances 24 ticks before boarding. Script the pickup at 150 m per tick.
    provider = Provider.PROVIDER_A
    monkeypatch.setitem(PROFILES, provider, replace(PROFILES[provider], speed_mps_range=(30.0, 30.0)))


@pytest.mark.usefixtures("fast_boarded_pickup")
def test_boarded_ride_keeps_the_booking_slot_until_destination(monkeypatch):
    duration = timedelta(seconds=75)
    route_requests = []

    def playback(pickup, dropoff):
        route_requests.append((pickup, dropoff))
        return duration

    monkeypatch.setattr(journeys, "destination_playback", playback)
    with TestClient(app) as client:
        rider = str(uuid4())
        first, second = create_journey(client), create_journey(client)
        assert book(client, first, rider).status_code == 200
        endpoint = f"/api/v1/journeys/{first['id']}"
        arrived = client.post(f"{endpoint}/tick", json={"steps": 24})
        assert arrived.json()["active_ride"]["state"] == "DRIVER_ARRIVED"
        action = {"idempotency_key": str(uuid4()), "expected_version": arrived.json()["version"]}
        boarding = client.post(f"{endpoint}/pickup/confirm", json=action)
        assert boarding.status_code == 200
        boarded = boarding.json()
        assert (
            datetime.fromisoformat(boarded["arrives_at"]) - datetime.fromisoformat(boarded["boarded_at"])
            == duration
        )
        assert (
            client.post(f"{endpoint}/pickup/confirm", json=action).json()["arrives_at"]
            == boarded["arrives_at"]
        )
        assert route_requests == [(LOCATIONS[0], LOCATIONS[1])]
        assert client.get(endpoint).json()["arrives_at"] == boarded["arrives_at"]

        boarded_at = datetime.fromisoformat(boarded["boarded_at"])
        assert boarded["destination_speed"] == 20
        changed_at = boarded_at + timedelta(seconds=15)
        monkeypatch.setattr("app.services.journey_service.clock_now", lambda: changed_at)
        assert client.post(f"{endpoint}/play", json={"speed": 1}).json() == {"playing": True, "speed": 1}
        normal = client.get(endpoint).json()
        assert normal["boarded_at"] == boarded["boarded_at"]
        assert normal["destination_speed"] == 1
        assert datetime.fromisoformat(normal["destination_started_at"]) == changed_at - timedelta(seconds=300)
        assert datetime.fromisoformat(normal["arrives_at"]) == changed_at + timedelta(seconds=1200)
        assert client.post(f"{endpoint}/play", json={"speed": 1}).status_code == 200
        assert client.get(endpoint).json()["arrives_at"] == normal["arrives_at"]
        assert client.post(f"{endpoint}/play", json={"speed": 20}).status_code == 200
        assert client.get(endpoint).json()["arrives_at"] == boarded["arrives_at"]
        assert route_requests == [(LOCATIONS[0], LOCATIONS[1])]

        blocked = book(client, second, rider)
        assert blocked.status_code == 409
        assert blocked.json()["error"]["code"] == "ACTIVE_RIDE_EXISTS"
        with store.lock:
            store.get(first["id"]).arrives_at = datetime.now(UTC) - timedelta(seconds=1)
        assert client.post(f"{endpoint}/play", json={"speed": 1}).status_code == 409
        assert book(client, second, rider).status_code == 200
