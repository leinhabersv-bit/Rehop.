"""Exercise the public HTTP boundary and its resumable event stream."""

import json
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from app.domain.invariants import check_invariants
from app.main import app
from app.schemas.domain import JourneySnapshot

SCHEMA = json.loads((Path(__file__).resolve().parents[4] / "contracts/events.schema.json").read_text())
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=Draft202012Validator.FORMAT_CHECKER)


def run_http(client, scenario, seed=2026):
    records = []
    collected = []
    cursor = 0

    def call(method, url, body=None, expected=200):
        response = client.request(method, url, json=body)
        assert response.status_code == expected, response.text
        data = response.json()
        records.append({"method": method, "url": url, "request": body, "status": expected, "response": data})
        return data

    state = call("POST", f"/api/v1/scenarios/{scenario}/run?seed={seed}")
    base = f"/api/v1/journeys/{state['id']}"

    def poll():
        nonlocal cursor
        url = f"{base}/events?since_seq={cursor}"
        response = client.get(url)
        assert response.status_code == 200
        batch = response.json()["events"]
        assert [e["seq"] for e in batch] == list(range(cursor + 1, cursor + len(batch) + 1))
        for event in batch:
            VALIDATOR.validate(event)
        collected.extend(batch)
        cursor += len(batch)
        unchanged = client.get(url, headers={"If-None-Match": response.headers["ETag"]})
        assert unchanged.status_code == 304 and not unchanged.content
        check_invariants(JourneySnapshot.model_validate(client.get(base).json()))

    poll()
    if scenario == "S12":
        call(
            "POST",
            base + "/book",
            {"quote_id": state["quotes"][0]["quote_id"], "idempotency_key": "initial"},
            409,
        )
    state = call("POST", base + "/tick", {"steps": 25})
    poll()
    if scenario == "S11":
        state = call(
            "POST", base + "/cancel", {"idempotency_key": "stop", "expected_version": state["version"]}
        )
    elif state["pending_backup"] and scenario != "S13":
        state = call(
            "POST",
            base + "/rescue/approve",
            {"approved": True, "idempotency_key": "approve", "expected_version": state["version"]},
        )
        if scenario == "S17":
            state = call("POST", base + "/tick", {"steps": 1})
    poll()
    if state["active_ride"] and state["active_ride"]["state"] == "DRIVER_ARRIVED":
        state = call(
            "POST",
            base + "/pickup/confirm",
            {"idempotency_key": "board", "expected_version": state["version"]},
        )
    poll()
    assert collected == client.get(base + "/events?since_seq=0").json()["events"]
    return state, collected, records


@pytest.mark.parametrize("scenario", [f"S{i:02}" for i in range(1, 18)])
def test_scenario_over_http(scenario):
    with TestClient(app) as client:
        state, events, _ = run_http(client, scenario)
    types = [e["type"] for e in events]
    expected = {
        "S01": "PICKUP_CONFIRMED",
        "S02": "PICKUP_CONFIRMED",
        "S03": "MONITORING",
        "S04": "PICKUP_CONFIRMED",
        "S05": "MONITORING",
        "S06": "EXHAUSTED",
        "S07": "EXHAUSTED",
        "S08": "MONITORING",
        "S09": "MONITORING",
        "S10": "PICKUP_CONFIRMED",
        "S11": "USER_CANCELLED",
        "S12": "EXHAUSTED",
        "S13": "AWAITING_APPROVAL",
        "S14": "MONITORING",
        "S15": "EXHAUSTED",
        "S16": "MONITORING",
        "S17": "MONITORING",
    }
    assert state["state"] == expected[scenario]
    if scenario in {"S02", "S08", "S09"}:
        assert "APPROVAL_REQUIRED" not in types
    if scenario == "S08":
        assert state["risk"]["band"] == "UNKNOWN"
    if scenario == "S05":
        assert state["recovery_attempts"] == 2 and state["active_ride"]
    if scenario == "S12":
        assert "RIDE_CONFIRMED" not in types
    if scenario == "S14":
        assert "RIDE_CANCEL_REQUESTED" not in types
    if scenario == "S15":
        assert state["active_ride"] is None and state["last_ride"]["state"] == "RIDER_CANCELLED"
        assert "RECOVERY_SUCCEEDED" not in types and types[-1] == "RECOVERY_EXHAUSTED"
    if scenario == "S17":
        assert (
            types.index("RECONCILIATION_REQUIRED")
            < types.index("RECONCILED")
            < types.index("RECOVERY_SUCCEEDED")
        )


def test_s03_websocket_matches_polled_events():
    with TestClient(app) as client:
        state, events, _ = run_http(client, "S03")
        with client.websocket_connect(f"/ws/journeys/{state['id']}?since_seq=0") as socket:
            assert [socket.receive_json() for _ in events] == events
        cursor = len(events) // 2
        with client.websocket_connect(f"/ws/journeys/{state['id']}?since_seq={cursor}") as socket:
            assert [socket.receive_json() for _ in events[cursor:]] == events[cursor:]


@pytest.mark.slow
def test_random_trip_smoke(record_property, monkeypatch):
    from datetime import UTC, datetime, timedelta

    now = datetime(2026, 11, 28, tzinfo=UTC)
    monkeypatch.setattr("app.simulation.durable.clock_now", lambda: now)
    monkeypatch.setattr("app.main.clock_now", lambda: now)
    counts = Counter()
    with TestClient(app) as client:
        for seed in range(1, 201):
            state = client.post(f"/api/v1/scenarios/RANDOM/run?seed={seed}").json()
            base = f"/api/v1/journeys/{state['id']}"
            result = client.post(
                base + "/book", json={"quote_id": state["quotes"][0]["quote_id"], "idempotency_key": "book"}
            )
            assert result.status_code in {200, 409}
            state = client.get(base).json()
            if result.status_code == 409 and state["state"] == "WAITING_FOR_RIDE":
                state = client.post(base + "/cancel", json={"idempotency_key": "failed-booking-stop"}).json()
            assert client.post(base + "/play", json={"speed": 20}).status_code == 200
            for step in range(360):
                if state["state"] in {"EXHAUSTED", "USER_CANCELLED", "PICKUP_CONFIRMED"}:
                    break
                if state["pending_backup"]:
                    response = client.post(
                        base + "/rescue/approve",
                        json={
                            "approved": True,
                            "idempotency_key": f"approve-{step}",
                            "expected_version": state["version"],
                        },
                    )
                elif state["active_ride"] and state["active_ride"]["state"] == "DRIVER_ARRIVED":
                    response = client.post(
                        base + "/pickup/confirm",
                        json={"idempotency_key": "board", "expected_version": state["version"]},
                    )
                else:
                    now += timedelta(seconds=3)
                    response = client.get(base)
                assert response.status_code == 200, response.text
                state = response.json()
                check_invariants(JourneySnapshot.model_validate(state))
            assert state["state"] in {"EXHAUSTED", "USER_CANCELLED", "PICKUP_CONFIRMED"}, (
                seed,
                state["state"],
            )
            for event in client.get(base + "/events").json()["events"]:
                VALIDATOR.validate(event)
            counts[state["state"]] += 1
    record_property("terminal_states", dict(counts))
    print("RANDOM terminal states", dict(counts))


@pytest.mark.parametrize("cancelled", [False, True])
def test_http_rejection_keeps_only_a_confirmed_original(cancelled, monkeypatch):
    monkeypatch.setenv("SIM_DEV_ENDPOINTS", "1")
    with TestClient(app) as client:
        if cancelled:
            locations = client.get("/api/v1/locations").json()["locations"]
            state = client.post(
                "/api/v1/journeys",
                json={
                    "pickup": locations[0],
                    "dropoff": locations[1],
                    "policy": {"auto_rebook_on_confirmed_driver_cancel": False},
                },
            ).json()
            base = f"/api/v1/journeys/{state['id']}"
            state = client.post(
                base + "/book",
                json={
                    "quote_id": state["quotes"][0]["quote_id"],
                    "idempotency_key": "book",
                },
            ).json()
            state = client.post(
                f"/api/v1/sim/journeys/{state['id']}/inject", json={"kind": "DRIVER_CANCEL", "params": {}}
            ).json()
        else:
            state = client.post("/api/v1/scenarios/S03/run").json()
            base = f"/api/v1/journeys/{state['id']}"
            state = client.post(base + "/tick", json={"steps": 25}).json()
        response = client.post(
            base + "/rescue/approve",
            json={
                "approved": False,
                "idempotency_key": "reject",
                "expected_version": state["version"],
            },
        )
        assert response.status_code == 200
        final = response.json()
        assert final["state"] == ("EXHAUSTED" if cancelled else "MONITORING")
        assert final["active_ride_id"] == (None if cancelled else state["active_ride_id"])
        events = client.get(base + "/events").json()["events"]
        for event in events:
            VALIDATOR.validate(event)
        if cancelled:
            assert events[-1]["payload"]["reason"] == "RIDER_DECLINED_REPLACEMENT"
