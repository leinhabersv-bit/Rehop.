from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

from fastapi.testclient import TestClient

from app.domain.invariants import check_invariants
from app.main import app
from app.schemas.domain import JourneySnapshot
from app.schemas.enums import EventType
from app.schemas.requests import JourneyCreate
from app.simulation import durable
from app.simulation.engine import LOCATIONS, SimulationStore

client = TestClient(app)
START = datetime(2026, 11, 25, tzinfo=UTC)


def booked_journey(monkeypatch, scenario="S01"):
    store = SimulationStore()
    monkeypatch.setattr(durable, "store", store)
    session = store.create(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),
        scenario=scenario,
        deterministic=True,
    )
    url = f"/api/v1/journeys/{session.id}"
    client.post(
        f"{url}/book",
        json={"quote_id": session.quotes[0].quote_id, "idempotency_key": "booking"},
    ).raise_for_status()
    return url


def test_speed_twenty_polling_matches_explicit_ticks(monkeypatch):
    now = START
    monkeypatch.setattr(durable, "clock_now", lambda: now)
    url = booked_journey(monkeypatch)
    assert client.post(f"{url}/play", json={"speed": 20}).raise_for_status().json() == {
        "playing": True,
        "speed": 20,
    }
    cursor = 0
    observed = []
    for elapsed_ms in (100, 250, 680, 1000, 1500):
        now = START + timedelta(milliseconds=elapsed_ms)
        # Both snapshot and event reads catch up under the same lock. They must not double tick.
        client.get(url).raise_for_status()
        page = client.get(f"{url}/events", params={"since_seq": cursor}).raise_for_status().json()
        observed.extend(page["events"])
        cursor = page["last_event_seq"]
    assert sum(event["type"] == "TELEMETRY_UPDATED" for event in observed) == 6

    baseline = booked_journey(monkeypatch)
    client.post(f"{baseline}/tick", json={"steps": 6}).raise_for_status()
    assert client.get(f"{baseline}/events").raise_for_status().json()["events"] == observed


def test_pause_stops_progress_and_poll_validators_are_cursor_specific(monkeypatch):
    now = START
    monkeypatch.setattr(durable, "clock_now", lambda: now)
    url = booked_journey(monkeypatch)
    client.post(f"{url}/play", json={"speed": 20}).raise_for_status()
    now += timedelta(milliseconds=375)
    response = client.post(f"{url}/pause").raise_for_status()
    assert response.json() == {"playing": False, "speed": 20}
    snapshot = client.get(url).raise_for_status().json()
    page = client.get(f"{url}/events").raise_for_status()
    assert [event["type"] for event in page.json()["events"]].count("TELEMETRY_UPDATED") == 1
    now += timedelta(minutes=10)
    unchanged = client.get(f"{url}/events", headers={"If-None-Match": f"W/{page.headers['ETag']}"})
    assert unchanged.status_code == 304
    assert unchanged.content == b""
    assert unchanged.headers["ETag"] == page.headers["ETag"]
    assert client.get(url).raise_for_status().json() == snapshot

    suffix = client.get(
        f"{url}/events",
        params={"since_seq": 1},
        headers={"If-None-Match": page.headers["ETag"]},
    ).raise_for_status()
    assert suffix.json()["events"] == page.json()["events"][1:]
    assert suffix.headers["ETag"] != page.headers["ETag"]

    client.post(f"{url}/play", json={"speed": 20}).raise_for_status()
    now += timedelta(milliseconds=249)
    assert client.get(url).raise_for_status().json() == snapshot
    now += timedelta(milliseconds=1)
    assert client.get(url).raise_for_status().json()["last_event_seq"] > snapshot["last_event_seq"]


def test_dev_injection_is_hidden_and_uses_the_driver_world(monkeypatch):
    monkeypatch.delenv("SIM_DEV_ENDPOINTS", raising=False)
    url = booked_journey(monkeypatch)
    inject_url = url.replace("/journeys/", "/sim/journeys/") + "/inject"
    payload = {"kind": "FORCE_MODE", "params": {"mode": "STALLED"}}
    assert client.post(inject_url, json=payload).status_code == 404
    assert (
        client.post(inject_url, content="{", headers={"Content-Type": "application/json"}).status_code == 404
    )

    monkeypatch.setenv("SIM_DEV_ENDPOINTS", "1")
    assert client.post(inject_url, json={"kind": "FORCE_MODE", "params": {"mode": "bad"}}).status_code == 422
    before = client.post(inject_url, json=payload).raise_for_status().json()
    after = client.post(f"{url}/tick", json={"steps": 3}).raise_for_status().json()
    assert after["active_ride"]["distance_to_pickup_m"] == before["active_ride"]["distance_to_pickup_m"]
    assert after["active_ride"]["eta_sec"] > before["active_ride"]["eta_sec"]


def test_concurrent_approve_cancel_and_poll_preserve_invariants(monkeypatch):
    now = START
    monkeypatch.setattr(durable, "clock_now", lambda: now)
    url = booked_journey(monkeypatch, scenario="S03")
    pending = client.post(f"{url}/tick", json={"steps": 20}).raise_for_status().json()
    assert pending["pending_backup"] is not None
    client.post(f"{url}/play", json={"speed": 20}).raise_for_status()
    now += timedelta(milliseconds=250)

    gate = Barrier(10)

    def operate(index):
        if index < 10:
            gate.wait(timeout=10)
        match index % 3:
            case 0:
                return client.post(
                    f"{url}/rescue/approve",
                    json={"approved": True, "idempotency_key": "race-approve"},
                )
            case 1:
                return client.post(f"{url}/cancel", json={"idempotency_key": "race-cancel"})
            case _:
                return client.get(f"{url}/events")

    with ThreadPoolExecutor(max_workers=10) as pool:
        for response in pool.map(operate, range(50)):
            if response.status_code == 409:
                assert response.json()["error"]["code"] == "INVALID_STATE"
            elif "events" in response.raise_for_status().json():
                events = response.json()["events"]
                assert [event["seq"] for event in events] == list(range(1, len(events) + 1))
            else:
                check_invariants(JourneySnapshot.model_validate(response.json()))

    final = JourneySnapshot.model_validate(client.get(url).raise_for_status().json())
    check_invariants(final)
    assert final.state == "USER_CANCELLED"
    assert final.active_ride_id is None
    events = client.get(f"{url}/events").raise_for_status().json()["events"]
    assert sum(event["type"] == EventType.USER_CANCELLED for event in events) == 1
    assert sum(event["type"] == EventType.SWITCH_APPROVED for event in events) <= 1
