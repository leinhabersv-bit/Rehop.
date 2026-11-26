from datetime import timedelta

import pytest

from app.intelligence import llm
from app.intelligence.decision import compare_wait_switch
from app.intelligence.llm import classify_driver_message, explain_with_verified_numbers, parse_ride_intent
from app.schemas.models import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.engine import BASE_TIME, LOCATIONS, Session

service = JourneyService()


def test_chat_fallback_classifies_cancel_request_without_authority(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert classify_driver_message("Please cancel kar do").label == "REQUEST_RIDER_CANCEL"
    assert classify_driver_message("Traffic, 10 min").label == "TRAFFIC_DELAY"


def test_intent_parser_requires_confirmation(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    parsed = parse_ride_intent("From VIT Chennai to Chennai Airport within 15 minutes", LOCATIONS)
    assert parsed.pickup == "VIT Chennai"
    assert parsed.dropoff == "Chennai Airport"
    assert parsed.need_in_minutes == 15
    assert parsed.requires_confirmation is True


@pytest.mark.parametrize(
    ("text", "pickup", "dropoff"),
    [
        ("From Chennai Airport to VIT Chennai", "Chennai Airport", "VIT Chennai"),
        ("To VIT Chennai from Chennai Airport", "Chennai Airport", "VIT Chennai"),
        ("Chennai Airport VIT Chennai", "Chennai Airport", "VIT Chennai"),
        ("From Chennai Airport", "Chennai Airport", None),
        ("To Chennai Airport", None, "Chennai Airport"),
        ("Chennai Airport", None, None),
    ],
)
def test_fallback_resolves_direction_and_leaves_missing_endpoint_blank(monkeypatch, text, pickup, dropoff):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = parse_ride_intent(text, LOCATIONS)
    assert (result.pickup, result.dropoff) == (pickup, dropoff)
    assert result.source == "rule_fallback"


def test_malformed_chat_classification_uses_labeled_fallback(monkeypatch):
    monkeypatch.setattr(llm, "_llm_json", lambda *args: {"label": ["ARRIVING"], "evidence": "Traffic"})
    signal = classify_driver_message("Traffic on the way")
    assert signal.label == "TRAFFIC_DELAY"
    assert signal.source == "rule_fallback"


def test_model_cannot_supply_unmentioned_location(monkeypatch):
    monkeypatch.setattr(llm, "_llm_json", lambda *args: {"pickup": "Guindy", "dropoff": "Chennai Airport"})
    parsed = parse_ride_intent("To Chennai Airport", LOCATIONS)
    assert parsed.pickup is None
    assert parsed.dropoff == "Chennai Airport"
    assert parsed.requires_confirmation


def test_explanation_rejects_llm_invented_numbers(monkeypatch):
    monkeypatch.setattr(
        llm, "_llm_json", lambda *args: {"explanation": "Your ETA is 200 minutes and fare is 9000"}
    )
    checked = explain_with_verified_numbers("Pickup risk is increasing.", [300])
    assert checked.source == "deterministic_template"


def test_urgency_changes_decision_without_changing_risk():
    args = dict(
        now=BASE_TIME,
        current_eta_sec=420,
        backup_eta_sec=240,
        current_fare_inr=320,
        backup_fare_inr=285,
        cancellation_fee_upper_bound_inr=32,
        risk_band="MEDIUM",
    )
    urgent = compare_wait_switch(**args, need_by=BASE_TIME + timedelta(minutes=5))
    relaxed = compare_wait_switch(**args, need_by=BASE_TIME + timedelta(minutes=20))
    assert urgent.recommendation == "PROPOSE_SWITCH"
    assert relaxed.recommendation == "WAIT_AND_MONITOR"


def test_scenario_chat_risk_does_not_cancel_ride():
    s = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]), scenario="S13")
    service.book(s.id, s.quotes[0].quote_id, "first", session=s)
    service.tick(s.id, 5, session=s)
    assert s.driver_chat_signal.label == "REQUEST_RIDER_CANCEL"
    assert s.ride.state == "DRIVER_EN_ROUTE"
    assert any(e.type == "RISK_SIGNAL_ADDED" for e in s.events)


def test_scenario_quote_refresh_failure_preserves_original():
    s = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]), scenario="S14")
    service.book(s.id, s.quotes[0].quote_id, "first", session=s)
    service.tick(s.id, 22, session=s)
    assert s.pending_backup is not None
    old_ride = s.ride.ride_id
    service.approve_switch(s.id, True, "switch", session=s)
    assert s.ride.ride_id == old_ride
    assert not any(e.type == "RIDE_CANCEL_REQUESTED" for e in s.events)
    assert any(e.type == "QUOTE_REFRESH_FAILED" for e in s.events)


def test_scenario_post_cancel_quote_failure_not_labeled_success():
    s = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]), scenario="S15")
    service.book(s.id, s.quotes[0].quote_id, "first", session=s)
    service.tick(s.id, 22, session=s)
    service.approve_switch(s.id, True, "switch", session=s)
    assert s.state == "EXHAUSTED" and s.ride is None
    assert any(e.type == "REPLACEMENT_QUOTE_LOST" for e in s.events)
    assert not any(e.type == "RECOVERY_SUCCEEDED" for e in s.events)


def test_simulation_offers_are_neutral():
    s = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    assert {q.provider for q in s.quotes} == {"PROVIDER_A", "PROVIDER_B", "PROVIDER_C", "PROVIDER_D"}


def test_urgent_session_proposes_earlier_than_relaxed_session():
    urgent = Session(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], need_by=BASE_TIME + timedelta(minutes=5)),
        scenario="S16",
    )
    relaxed = Session(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], need_by=BASE_TIME + timedelta(minutes=20)),
        scenario="S16",
    )
    for sess in (urgent, relaxed):
        service.book(sess.id, sess.quotes[0].quote_id, "initial", session=sess)
        service.tick(sess.id, 9, session=sess)
    assert urgent.pending_backup is not None
    assert relaxed.pending_backup is None
