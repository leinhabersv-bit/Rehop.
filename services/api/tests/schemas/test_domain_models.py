import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.domain import (
    ChatSignal,
    DeadlineDecision,
    FeeNotice,
    JourneyEvent,
    JourneySnapshot,
    OperationResult,
    Quote,
    Ride,
    RiskAssessment,
    TelemetrySample,
)
from app.schemas.enums import (
    ChatLabel,
    DecisionType,
    EventType,
    GpsQuality,
    JourneyState,
    OpStatus,
    Provider,
    RideState,
    RiskBand,
)
from app.schemas.requests import RecoveryPolicy

UTC_TIME = "2026-11-23T08:30:00+00:00"
OFFSET_TIME = "2026-11-23T14:05:00.123000+05:30"
LOCATION = {"label": "Example", "lat": 12.5, "lng": 80.5}
QUOTE = {
    "quote_id": "quote_1",
    "provider": "PROVIDER_A",
    "estimated_fare_inr": 320,
    "pickup_eta_sec": 300,
    "expires_at": UTC_TIME,
    "is_simulated": True,
}
RIDE = {
    "ride_id": "ride_1",
    "journey_id": "journey_1",
    "provider": "PROVIDER_A",
    "quote_id": "quote_1",
    "state": "DRIVER_EN_ROUTE",
    "booked_at": UTC_TIME,
    "driver_id": "driver_1",
    "distance_to_pickup_m": 2200,
    "eta_sec": 300,
    "last_position_at": UTC_TIME,
    "cancellation_fee_inr": None,
    "gps_quality": "GOOD",
    "is_simulated": True,
}
TELEMETRY = {
    "ride_id": "ride_1",
    "observed_at": OFFSET_TIME,
    "distance_to_pickup_m": 2200,
    "eta_sec": 300,
    "lat": None,
    "lng": None,
    "gps_quality": "GOOD",
}
RISK = {
    "score_0_100": 55,
    "band": "MEDIUM",
    "confidence": 0.65,
    "model_version": "rules-v1",
    "signals": ["short_stop", "eta_rising"],
    "explanation": "Pickup may be delayed.",
    "is_simulated": True,
}
CHAT = {"label": "TRAFFIC_DELAY", "evidence": "traffic", "source": "rule_fallback", "is_advisory": True}
FEE = {
    "potential_fee_upper_bound_inr": 32,
    "actual_fee_inr": None,
    "fee_confirmed": False,
    "source": "simulation",
    "caution": "Illustrative fee.",
}
DECISION = {
    "seconds_until_deadline": 30,
    "wait_late_sec": 300,
    "switch_late_sec": 180,
    "wait_cost_points": 640,
    "switch_cost_points": 392,
    "recommendation": "PROPOSE_SWITCH",
    "formula": "simulated heuristic",
}
EVENT = {
    "event_id": "journey_1_evt_0001",
    "journey_id": "journey_1",
    "seq": 1,
    "timestamp": UTC_TIME,
    "type": "RIDE_CONFIRMED",
    "ride_id": "ride_1",
    "payload": {"ride": RIDE, "replacement": False},
}
SNAPSHOT = {
    "id": "journey_1",
    "pickup": LOCATION,
    "dropoff": {**LOCATION, "label": "Other"},
    "created_at": UTC_TIME,
    "state": "MONITORING",
    "need_by": OFFSET_TIME,
    "driver_chat_signal": CHAT,
    "deadline_decision": DECISION,
    "cancellation_fee_notice": FEE,
    "active_ride_id": "ride_1",
    "version": 1,
    "last_event_seq": 1,
    "policy": RecoveryPolicy().model_dump(mode="json"),
    "quotes": [QUOTE],
    "active_ride": RIDE,
    "last_ride": None,
    "risk": RISK,
    "pending_backup": None,
    "recovery_attempts": 0,
    "booking_uncertain": False,
    "scenario": "S03",
    "simulated_time": UTC_TIME,
    "is_simulated": True,
}


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (Quote, QUOTE),
        (Ride, RIDE),
        (TelemetrySample, TELEMETRY),
        (RiskAssessment, RISK),
        (RiskAssessment, {**RISK, "explanation_source": "deterministic_template"}),
        (ChatSignal, CHAT),
        (FeeNotice, FEE),
        (DeadlineDecision, DECISION),
        (OperationResult, {"status": "CONFIRMED", "ride": RIDE, "reason": None}),
        (JourneyEvent, EVENT),
        (JourneyEvent, {**EVENT, "type": "RISK_UPDATED", "payload": RISK}),
        (JourneyEvent, {**EVENT, "type": "DEADLINE_DECISION", "payload": DECISION}),
        (JourneySnapshot, SNAPSHOT),
    ],
)
def test_domain_model_json_round_trip(model, payload):
    instance = model.model_validate(payload)
    assert instance.model_dump(mode="json") == payload
    assert model.model_validate_json(instance.model_dump_json()) == instance


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (Quote, QUOTE, "estimated_fare_inr"),
        (Ride, RIDE, "cancellation_fee_inr"),
        (FeeNotice, FEE, "potential_fee_upper_bound_inr"),
        (FeeNotice, FEE, "actual_fee_inr"),
    ],
)
@pytest.mark.parametrize("invalid_money", [-1, 1.5])
def test_money_requires_nonnegative_integer_rupees(model, payload, field, invalid_money):
    with pytest.raises(ValidationError, match=field):
        model.model_validate({**payload, field: invalid_money})


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (Quote, QUOTE, "expires_at"),
        (Ride, RIDE, "booked_at"),
        (Ride, RIDE, "last_position_at"),
        (TelemetrySample, TELEMETRY, "observed_at"),
        (JourneyEvent, EVENT, "timestamp"),
        (JourneySnapshot, SNAPSHOT, "created_at"),
        (JourneySnapshot, SNAPSHOT, "need_by"),
        (JourneySnapshot, SNAPSHOT, "simulated_time"),
    ],
)
def test_timestamps_require_a_timezone(model, payload, field):
    with pytest.raises(ValidationError, match=field):
        model.model_validate({**payload, field: "2026-11-23T08:30:00"})


@pytest.mark.parametrize(
    "enum",
    [Provider, JourneyState, RideState, RiskBand, GpsQuality, OpStatus, ChatLabel, DecisionType, EventType],
)
def test_unknown_enum_values_are_rejected(enum):
    with pytest.raises(ValidationError, match="Outside the enum"):
        TypeAdapter(enum).validate_python("Outside the enum")
