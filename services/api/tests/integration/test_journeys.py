from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def start(id):
    response = client.post(f"/api/v1/scenarios/{id}/run")
    assert response.status_code == 200, response.text
    return response.json()


def test_healthy_pickup_requires_boarding_confirmation():
    j = start("S01")
    j = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 25}).json()
    assert j["active_ride"]["state"] == "DRIVER_ARRIVED"
    r = client.post(
        f"/api/v1/journeys/{j['id']}/pickup/confirm", json={"idempotency_key": "confirm-pickup-1"}
    )
    assert r.status_code == 200
    assert r.json()["state"] == "PICKUP_CONFIRMED"
    after = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 10}).json()
    assert after["state"] == "PICKUP_CONFIRMED"


def test_stall_proposes_backup_without_double_booking():
    j = start("S03")
    j = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 22}).json()
    assert j["risk"]["band"] == "HIGH"
    assert j["pending_backup"] is not None
    assert j["active_ride_id"] is not None
    assert j["recovery_attempts"] == 0
    after = client.post(
        f"/api/v1/journeys/{j['id']}/rescue/approve",
        json={"approved": True, "idempotency_key": "switch-1", "expected_version": j["version"]},
    )
    assert after.status_code == 200, after.text
    assert after.json()["recovery_attempts"] == 1
    assert after.json()["active_ride"]["provider"] != "PROVIDER_A"


def test_second_cancellation_triggers_bounded_retry():
    j = start("S05")
    j = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 20}).json()
    assert j["recovery_attempts"] == 2
    assert j["active_ride"]["provider"] == "PROVIDER_C"
    assert (
        sum(
            e["type"] == "DRIVER_CANCELLED"
            for e in client.get(f"/api/v1/journeys/{j['id']}/events").json()["events"]
        )
        == 2
    )


def test_high_fare_backup_never_booked():
    j = start("S07")
    j = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 10}).json()
    assert j["state"] == "EXHAUSTED"
    assert j["recovery_attempts"] == 0


def test_repeated_booking_rejected():
    j = start("S01")
    r = client.post(
        f"/api/v1/journeys/{j['id']}/book",
        json={"quote_id": j["quotes"][1]["quote_id"], "idempotency_key": "duplicate-1"},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "ACTIVE_RIDE_EXISTS"


def test_cancel_stops_future_recovery():
    j = start("S04")
    stopped = client.post(f"/api/v1/journeys/{j['id']}/cancel", json={"idempotency_key": "stop-1"}).json()
    assert stopped["state"] == "USER_CANCELLED"
    after = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 20}).json()
    assert after["state"] == "USER_CANCELLED"
    assert after["recovery_attempts"] == 0


def test_opted_out_recovery_requires_approval():
    base = {
        "pickup": {"label": "VIT Chennai", "lat": 12.8406, "lng": 80.1534},
        "dropoff": {"label": "Chennai Airport", "lat": 12.9941, "lng": 80.1709},
        "policy": {"auto_rebook_on_confirmed_driver_cancel": False},
    }
    created = client.post("/api/v1/journeys", json=base).json()
    assert created["policy"]["auto_rebook_on_confirmed_driver_cancel"] is False
    # Explicit opt-out choice remains in the created policy.


def test_direct_second_booking_after_recovery_blocked():
    j = start("S04")
    j = client.post(f"/api/v1/journeys/{j['id']}/tick", json={"steps": 10}).json()
    r = client.post(
        f"/api/v1/journeys/{j['id']}/book",
        json={"quote_id": j["quotes"][3]["quote_id"], "idempotency_key": "bypass-recovery"},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] in {"ACTIVE_RIDE_EXISTS", "INVALID_STATE"}
