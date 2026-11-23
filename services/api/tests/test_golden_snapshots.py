import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from app.main import app

GOLDEN_DIR = Path(__file__).with_name("golden")
EVENT_SCHEMA = Path(__file__).resolve().parents[3] / "contracts" / "events.schema.json"
SCENARIOS = [f"S{number:02}" for number in range(1, 17)]


@pytest.fixture(params=SCENARIOS)
def golden_run(request, monkeypatch):
    scenario = request.param
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with TestClient(app) as client:
        scenario_url = f"/api/v1/scenarios/{scenario}"
        started = client.post(f"{scenario_url}/run", params={"seed": 2026}).raise_for_status().json()
        journey_url = f"/api/v1/journeys/{started['id']}"
        final = client.post(f"{scenario_url}/tick", json={"steps": 25}).raise_for_status().json()

        if scenario in {"S14", "S15"} and final["pending_backup"]:
            final = (
                client.post(
                    f"{journey_url}/rescue/approve",
                    json={
                        "approved": True,
                        "idempotency_key": f"golden-approve-{scenario}",
                        "expected_version": final["version"],
                    },
                )
                .raise_for_status()
                .json()
            )

        events = client.get(f"{journey_url}/events").raise_for_status().json()["events"]

    assert final["id"] == started["id"]
    assert events
    assert len(events) == final["last_event_seq"]
    return scenario, final, events


def test_golden_snapshot(golden_run):
    scenario, final, events = golden_run
    snapshot = {
        "journey_keys": sorted(final),
        "event_types": [event["type"] for event in events],
        "event_payload_keys": [sorted(event["payload"]) for event in events],
    }
    path = GOLDEN_DIR / f"{scenario}.json"
    if os.environ.get("UPDATE_GOLDEN") == "1":
        path.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    else:
        assert snapshot == json.loads(path.read_text(encoding="utf-8"))


def test_golden_events_match_schema(golden_run):
    _, _, events = golden_run
    schema = json.loads(EVENT_SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    failures = [
        f"event {event['seq']} ({event['type']}) at {error.json_path}: {error.message}"
        for event in events
        for error in validator.iter_errors(event)
    ]
    assert not failures, "\n".join(failures)
