import re
from dataclasses import replace
from decimal import Decimal

import pytest

from app.intelligence.config import RiskConfig
from app.intelligence.features import RideFeatures
from app.intelligence.risk import RiskTracker, assess, assess_v2
from app.schemas.domain import ChatSignal
from app.schemas.enums import ChatLabel, GpsQuality, RiskBand
from app.schemas.requests import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, SimulationStore

CONFIG = RiskConfig()
HEALTHY = RideFeatures(
    distance_to_pickup_m=900,
    net_progress_m_60s=240,
    net_progress_m_120s=480,
    net_progress_m_180s=720,
    stationary_duration_s=0,
    eta_delta_s_120s=-60,
    gps_age_s=0,
    gps_quality=GpsQuality.GOOD,
    samples_in_window=37,
    route_progress_ratio=0.4,
    elapsed_since_accept_s=180,
    seconds_until_need_by=600,
    span_60s=60,
    span_120s=120,
    span_180s=180,
    eta_sec=140,
)
CHAT = ChatSignal(
    label=ChatLabel.REQUEST_RIDER_CANCEL, evidence="Please cancel.", source="test", is_advisory=True
)
STALL = replace(HEALTHY, stationary_duration_s=90, net_progress_m_120s=0, eta_delta_s_120s=270)
CASE_DATA = [
    ("healthy", HEALTHY, None, 0, RiskBand.LOW),
    (
        "red_light_60s",
        replace(HEALTHY, stationary_duration_s=60, eta_delta_s_120s=45),
        None,
        17,
        RiskBand.LOW,
    ),
    ("s02_temporary_stop", replace(HEALTHY, stationary_duration_s=25), None, 0, RiskBand.LOW),
    ("short_stall_40s", replace(STALL, stationary_duration_s=40, span_120s=40), None, 40, RiskBand.MEDIUM),
    ("stall_90s", STALL, None, 70, RiskBand.HIGH),
    ("detour", replace(HEALTHY, net_progress_m_120s=-200, eta_delta_s_120s=90), None, 60, RiskBand.MEDIUM),
    (
        "near_pickup_idle",
        replace(STALL, distance_to_pickup_m=150, stationary_duration_s=180),
        None,
        39,
        RiskBand.LOW,
    ),
    (
        "near_pickup_long_idle",
        replace(
            STALL,
            distance_to_pickup_m=150,
            stationary_duration_s=181,
            seconds_until_need_by=-5,
            net_progress_m_120s=-200,
        ),
        None,
        88,
        RiskBand.HIGH,
    ),
    ("stale_gps", replace(STALL, gps_age_s=30), None, 0, RiskBand.UNKNOWN),
    ("poor_gps", replace(STALL, gps_quality=GpsQuality.POOR), None, 0, RiskBand.UNKNOWN),
    ("sparse_gps", replace(STALL, samples_in_window=2), None, 0, RiskBand.UNKNOWN),
    ("fresh_accept", replace(STALL, elapsed_since_accept_s=59), None, 69, RiskBand.MEDIUM),
    ("deadline_passed", replace(HEALTHY, seconds_until_need_by=-10), None, 3, RiskBand.LOW),
    ("healthy_chat", HEALTHY, CHAT, 20, RiskBand.LOW),
    (
        "short_stall_40s_with_chat",
        replace(STALL, stationary_duration_s=40, span_120s=40),
        CHAT,
        60,
        RiskBand.MEDIUM,
    ),
    ("tiny_progress_window", replace(HEALTHY, span_120s=10, net_progress_m_120s=0), None, 0, RiskBand.LOW),
    (
        "score_saturation",
        replace(STALL, stationary_duration_s=180, net_progress_m_120s=-200, seconds_until_need_by=-5),
        CHAT,
        100,
        RiskBand.HIGH,
    ),
]


@pytest.mark.parametrize(
    "features,chat,score,band",
    [pytest.param(features, chat, score, band, id=name) for name, features, chat, score, band in CASE_DATA],
)
def test_v2_scores_and_bands(features, chat, score, band):
    result = assess_v2(features, chat, CONFIG)
    assert (result.score_0_100, result.band, result.model_version) == (score, band, "rules-v2")
    assert list(dict.fromkeys(detail.code for detail in result.signal_details)) == result.signals
    assert sum(detail.points for detail in result.signal_details) == score
    if band == RiskBand.UNKNOWN:
        assert result.confidence <= 0.3
        assert result.signals == ["stale_or_low_quality_gps"]


def test_explanation_numbers_are_traceable_and_language_is_neutral():
    for _, features, chat, _, _ in CASE_DATA:
        result = assess_v2(features, chat, CONFIG)
        evidence = {
            Decimal(str(value))
            for detail in result.signal_details
            for value in (detail.value, detail.threshold, detail.points)
            if isinstance(value, int | float)
        }
        numbers = re.findall(r"-?\d+(?:\.\d+)?", result.explanation)
        assert {Decimal(value) for value in numbers} <= evidence
        assert not re.search(r"\b(cheating|fake|lying|refusing)\b", result.explanation, re.IGNORECASE)


def test_chat_text_is_never_copied_into_explanation():
    chat = CHAT.model_copy(update={"evidence": "This driver is cheating, fake, lying and refusing 812."})
    result = assess_v2(HEALTHY, chat, CONFIG)
    assert result.explanation == "A driver message asked the rider to cancel."


def test_confidence_increases_with_samples_and_decreases_with_gps_age():
    sparse = assess_v2(replace(HEALTHY, samples_in_window=3), None, CONFIG)
    fuller = assess_v2(replace(HEALTHY, samples_in_window=18), None, CONFIG)
    older = assess_v2(replace(HEALTHY, samples_in_window=18, gps_age_s=20), None, CONFIG)
    assert sparse.confidence < fuller.confidence
    assert older.confidence < fuller.confidence


def test_hysteresis_rises_immediately_and_needs_two_uninterrupted_lower_assessments():
    tracker = RiskTracker()
    low, high = (assess_v2(features, None, CONFIG) for features in (HEALTHY, STALL))
    unknown = assess_v2(replace(STALL, gps_age_s=30), None, CONFIG)
    assert tracker.update("ride_a", low, CONFIG).band == RiskBand.LOW
    assert tracker.update("ride_a", high, CONFIG).band == RiskBand.HIGH
    held = tracker.update("ride_a", low, CONFIG)
    assert (held.band, held.score_0_100) == (RiskBand.HIGH, CONFIG.high_cutoff)
    assert held.signal_details[-1].code == "hysteresis_hold"
    assert tracker.update("ride_a", unknown, CONFIG).band == RiskBand.UNKNOWN
    assert tracker.update("ride_a", low, CONFIG).band == RiskBand.HIGH
    assert tracker.update("ride_a", low, CONFIG).band == RiskBand.LOW
    assert tracker.update("ride_a", high, CONFIG).band == RiskBand.HIGH
    assert tracker.update("ride_b", low, CONFIG).band == RiskBand.LOW


def test_near_pickup_cap_overrides_a_held_high_band():
    tracker = RiskTracker()
    tracker.update("ride", assess_v2(STALL, None, CONFIG), CONFIG)
    near = assess_v2(replace(STALL, distance_to_pickup_m=150), None, CONFIG)
    assert tracker.update("ride", near, CONFIG).band == RiskBand.LOW


def test_hysteresis_survives_stored_session_restore():
    journey = SimulationStore().create(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),
        scenario="S03",
        deterministic=True,
    )
    service = JourneyService()
    service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    service.tick(journey.id, 19, session=journey)
    assert journey.risk.band == RiskBand.HIGH
    newer = assess_v2(HEALTHY, None, CONFIG)
    assert journey.risk_tracker.update(journey.ride.ride_id, newer, CONFIG).band == RiskBand.HIGH
    payload = StoredSession.model_validate(vars(journey)).model_dump_json()
    restored = StoredSession.model_validate_json(payload).restore()
    assert restored.risk_tracker.lower_count == 1
    assert restored.risk_tracker.update(restored.ride.ride_id, newer, CONFIG).band == RiskBand.LOW


def test_v1_baseline_serialization_keeps_its_old_shape():
    baseline = assess(
        stationary_duration_s=90,
        eta_delta_s=90,
        distance_to_pickup_m=900,
        gps_age_s=0,
        gps_quality=GpsQuality.GOOD,
    )
    assert (baseline.model_version, baseline.score_0_100, baseline.band) == ("rules-v1", 85, RiskBand.HIGH)
    assert "signal_details" not in baseline.model_dump()


def test_s02_temporary_stop_never_reaches_high_in_the_world():
    journey = SimulationStore().create(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),
        scenario="S02",
        deterministic=True,
    )
    service = JourneyService()
    service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    service.tick(journey.id, 25, session=journey)
    bands = [event.payload.band for event in journey.events if event.type == "RISK_UPDATED"]
    assert bands and RiskBand.HIGH not in bands
