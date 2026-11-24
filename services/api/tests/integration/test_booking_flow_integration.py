from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app

client = TestClient(app)

BASE_TIME = datetime(2026, 11, 23, 8, 30, tzinfo=UTC)


def test_full_booking_flow_and_safety_invariants():
    # 1. Locations check
    loc_resp = client.get("/api/v1/locations")
    assert loc_resp.status_code == 200
    locations = loc_resp.json()["locations"]
    assert len(locations) >= 2
    pickup = locations[0]
    dropoff = locations[1]

    # 2. Intent parsing
    intent_resp = client.post(
        "/api/v1/intent/parse", json={"text": "From VIT Chennai to Chennai Airport within 20 mins under 800"}
    )
    assert intent_resp.status_code == 200
    intent = intent_resp.json()
    assert intent["requires_confirmation"] is True

    # 3. Validation: same pickup and destination rejected
    same_resp = client.post(
        "/api/v1/journeys",
        json={
            "pickup": pickup,
            "dropoff": pickup,
            "policy": {"max_total_fare_inr": 700},
            "need_by": (BASE_TIME + timedelta(minutes=20)).isoformat(),
        },
    )
    assert same_resp.status_code == 422

    # 4. Validation: need_by requires timezone offset
    naive_resp = client.post(
        "/api/v1/journeys",
        json={
            "pickup": pickup,
            "dropoff": dropoff,
            "need_by": "2026-11-23T08:50:00",  # missing timezone
        },
    )
    assert naive_resp.status_code == 422

    # 5. Create journey successfully
    need_by = (BASE_TIME + timedelta(minutes=20)).isoformat()
    create_resp = client.post(
        "/api/v1/journeys",
        json={
            "pickup": pickup,
            "dropoff": dropoff,
            "policy": {
                "max_total_fare_inr": 300,
                "max_recovery_attempts": 2,
                "auto_rebook_on_confirmed_driver_cancel": True,
                "max_cancellation_fee_inr": 100,
            },
            "need_by": need_by,
        },
    )
    assert create_resp.status_code == 201
    journey = create_resp.json()
    journey_id = journey["id"]
    assert journey["state"] == "WAITING_FOR_RIDE"
    assert len(journey["quotes"]) == 4
    providers = {q["provider"] for q in journey["quotes"]}
    assert providers == {"PROVIDER_A", "PROVIDER_B", "PROVIDER_C", "PROVIDER_D"}

    # 6. Booking rejection: quote not found
    bad_quote = client.post(
        f"/api/v1/journeys/{journey_id}/book",
        json={"quote_id": "non_existent_quote_id", "idempotency_key": "key-bad-quote"},
    )
    assert bad_quote.status_code == 409
    assert bad_quote.json()["error"]["code"] == "QUOTE_NOT_FOUND"

    # 7. Booking rejection: fare exceeds budget limit
    expensive_quote = next(q for q in journey["quotes"] if q["estimated_fare_inr"] > 300)
    over_budget = client.post(
        f"/api/v1/journeys/{journey_id}/book",
        json={"quote_id": expensive_quote["quote_id"], "idempotency_key": "key-over-budget"},
    )
    assert over_budget.status_code == 409
    assert over_budget.json()["error"]["code"] == "POLICY_FARE_LIMIT"

    # 8. Successful booking with valid quote
    valid_quote = next(q for q in journey["quotes"] if q["estimated_fare_inr"] <= 300)
    book_resp = client.post(
        f"/api/v1/journeys/{journey_id}/book",
        json={
            "quote_id": valid_quote["quote_id"],
            "idempotency_key": "key-valid-booking",
            "expected_version": journey["version"],
        },
    )
    assert book_resp.status_code == 200
    booked_journey = book_resp.json()
    assert booked_journey["state"] == "MONITORING"
    assert booked_journey["active_ride_id"] is not None
    assert booked_journey["active_ride"]["driver_id"] == "SIM_DRIVER_1"
    assert booked_journey["active_ride"]["state"] == "DRIVER_EN_ROUTE"
    assert booked_journey["active_ride"]["provider"] == valid_quote["provider"]

    # 9. Duplicate booking attempt rejected
    dup_resp = client.post(
        f"/api/v1/journeys/{journey_id}/book",
        json={"quote_id": journey["quotes"][0]["quote_id"], "idempotency_key": "key-different-attempt"},
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["error"]["code"] == "ACTIVE_RIDE_EXISTS"

    # 10. Snapshot verification
    get_resp = client.get(f"/api/v1/journeys/{journey_id}")
    assert get_resp.status_code == 200
    snap = get_resp.json()
    assert snap["id"] == journey_id
    assert snap["active_ride"]["driver_id"] == "SIM_DRIVER_1"

    # 11. Events timeline includes RIDE_CONFIRMED
    evt_resp = client.get(f"/api/v1/journeys/{journey_id}/events")
    assert evt_resp.status_code == 200
    event_types = [e["type"] for e in evt_resp.json()["events"]]
    assert "JOURNEY_CREATED" in event_types
    assert "QUOTES_READY" in event_types
    assert "RIDE_CONFIRMED" in event_types


def trip_request(**updates):
    pickup, dropoff, *_ = client.get("/api/v1/locations").raise_for_status().json()["locations"]
    return {"pickup": pickup, "dropoff": dropoff, **updates}


def start_journey(**updates):
    return client.post("/api/v1/journeys", json=trip_request(**updates)).raise_for_status().json()


def test_rejects_past_deadline_and_identical_coordinates():
    past = (BASE_TIME - timedelta(minutes=1)).isoformat()
    assert client.post("/api/v1/journeys", json=trip_request(need_by=past)).status_code == 422
    payload = trip_request()
    payload["dropoff"] = {**payload["pickup"], "label": "Same coordinates"}
    assert client.post("/api/v1/journeys", json=payload).status_code == 422
    assert client.post("/api/v1/quotes", json=payload).status_code == 422


def test_quote_expiry_takes_precedence_over_provider_confirmation():
    journey = start_journey()
    url = f"/api/v1/journeys/{journey['id']}"
    client.post(f"{url}/tick", json={"steps": 6}).raise_for_status()
    result = client.post(
        f"{url}/book", json={"quote_id": journey["quotes"][0]["quote_id"], "idempotency_key": "expire-test"}
    )
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "QUOTE_EXPIRED"
    assert client.get(url).json()["active_ride"] is None


def test_concurrent_booking_retry_applies_once_and_cross_action_reuse_is_rejected():
    journey = start_journey()
    url = f"/api/v1/journeys/{journey['id']}"
    payload = {
        "quote_id": journey["quotes"][0]["quote_id"],
        "idempotency_key": "one-active-booking",
        "expected_version": journey["version"],
    }

    def book():
        return client.post(f"{url}/book", json=payload).raise_for_status().json()["active_ride_id"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(book)
        second = pool.submit(book)
        assert first.result() == second.result()
    events = client.get(f"{url}/events").raise_for_status().json()["events"]
    assert sum(event["type"] == "RIDE_CONFIRMED" for event in events) == 1

    for action, body in (
        ("book", {**payload, "quote_id": journey["quotes"][1]["quote_id"]}),
        ("cancel", {"idempotency_key": payload["idempotency_key"]}),
    ):
        conflict = client.post(f"{url}/{action}", json=body)
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


def test_optional_stalled_scenario_preserves_id_through_recovery_and_pickup():
    route = "/api/v1/journeys"
    assert client.post(f"{route}?scenario=S12", json=trip_request()).status_code == 422
    journey = client.post(f"{route}?scenario=S03", json=trip_request()).raise_for_status().json()
    assert journey["state"] == "WAITING_FOR_RIDE"
    assert journey["scenario"] == "S03"
    url = f"{route}/{journey['id']}"
    booked = (
        client.post(
            f"{url}/book",
            json={"quote_id": journey["quotes"][0]["quote_id"], "idempotency_key": "initial-booking"},
        )
        .raise_for_status()
        .json()
    )
    stalled = client.post(f"{url}/tick", json={"steps": 25}).raise_for_status().json()
    assert stalled["state"] == "AWAITING_APPROVAL"
    assert stalled["pending_backup"] is not None
    assert stalled["active_ride_id"] == booked["active_ride_id"]
    approval = {"approved": True, "idempotency_key": "rider-approved"}
    stale = client.post(f"{url}/rescue/approve", json={**approval, "expected_version": booked["version"]})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "STALE_JOURNEY_VERSION"
    replacement = (
        client.post(f"{url}/rescue/approve", json={**approval, "expected_version": stalled["version"]})
        .raise_for_status()
        .json()
    )
    assert replacement["active_ride_id"] != booked["active_ride_id"]
    assert replacement["last_ride"]["state"] == "RIDER_CANCELLED"
    arrived = client.post(f"{url}/tick", json={"steps": 25}).raise_for_status().json()
    assert arrived["active_ride"]["state"] == "DRIVER_ARRIVED"
    assert arrived["active_ride"]["eta_sec"] == 0
    boarded = (
        client.post(
            f"{url}/pickup/confirm",
            json={"idempotency_key": "boarded", "expected_version": arrived["version"]},
        )
        .raise_for_status()
        .json()
    )
    assert all(item["id"] == journey["id"] for item in (booked, stalled, replacement, arrived, boarded))
    assert boarded["active_ride"]["state"] == "IN_PROGRESS"
    assert boarded["state"] == "PICKUP_CONFIRMED"
    after_tick = client.post(f"{url}/tick", json={"steps": 25}).raise_for_status().json()
    assert after_tick["last_event_seq"] == boarded["last_event_seq"]


def test_websocket_reconnect_replays_ordered_events_after_cursor():
    journey = start_journey()
    url = f"/ws/journeys/{journey['id']}"
    with client.websocket_connect(f"{url}?since_seq=0") as stream:
        first = stream.receive_json()
        assert first["seq"] == 1
    with client.websocket_connect(f"{url}?since_seq={first['seq']}") as stream:
        assert stream.receive_json()["seq"] == 2
        client.post(
            f"/api/v1/journeys/{journey['id']}/book",
            json={"quote_id": journey["quotes"][0]["quote_id"], "idempotency_key": "live-event-book"},
        ).raise_for_status()
        live = stream.receive_json()
        assert live["seq"] == 3
        assert live["type"] == "RIDE_CONFIRMED"
    with (
        client.websocket_connect(f"{url}?since_seq=invalid") as stream,
        pytest.raises(WebSocketDisconnect) as error,
    ):
        stream.receive_json()
    assert error.value.code == 4400
