from dataclasses import replace
from datetime import timedelta

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domain.state_machine import ACTIVE_RIDE_STATES
from app.intelligence.config import DecisionConfig
from app.intelligence.decision import DecisionContext, decide
from app.intelligence.features import RideFeatures
from app.intelligence.recovery import rank_backups
from app.schemas.domain import ChatSignal, Quote, Ride, RiskAssessment
from app.schemas.enums import DecisionType, JourneyState, Provider, RideState, RiskBand
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import BASE_TIME, LOCATIONS, SimulationStore
from app.simulation.profiles import PROFILES

CONFIG = DecisionConfig()
NOW = BASE_TIME + timedelta(seconds=90)
RIDE = Ride(
    ride_id="ride",
    journey_id="journey",
    provider=Provider.PROVIDER_A,
    quote_id="original",
    state=RideState.DRIVER_EN_ROUTE,
    booked_at=BASE_TIME,
    driver_id="driver",
    distance_to_pickup_m=2000,
    eta_sec=420,
    last_position_at=NOW,
    cancellation_fee_inr=None,
    gps_quality="GOOD",
    is_simulated=True,
)
FEATURES = RideFeatures(
    distance_to_pickup_m=2000,
    net_progress_m_60s=0,
    net_progress_m_120s=0,
    net_progress_m_180s=0,
    stationary_duration_s=90,
    eta_delta_s_120s=120,
    gps_age_s=0,
    gps_quality="GOOD",
    samples_in_window=18,
    route_progress_ratio=0,
    elapsed_since_accept_s=90,
    seconds_until_need_by=300,
    span_60s=60,
    span_120s=90,
    span_180s=90,
    eta_sec=420,
)


def risk(band):
    return RiskAssessment(
        band=band,
        score_0_100=50,
        confidence=1,
        model_version="rules-v2",
        signals=[],
        explanation="Observed pickup delay.",
        is_simulated=True,
    )


def quote(provider=Provider.PROVIDER_B, *, eta=240, fare=285, valid_until=NOW + timedelta(seconds=30)):
    return Quote(
        quote_id=provider.value,
        provider=provider,
        estimated_fare_inr=fare,
        pickup_eta_sec=eta,
        expires_at=valid_until,
        is_simulated=True,
    )


BASE = DecisionContext(
    journey_state=JourneyState.MONITORING,
    active_ride=RIDE,
    risk=risk(RiskBand.MEDIUM),
    features=FEATURES,
    chat_signal=None,
    need_by=NOW + timedelta(seconds=300),
    now=NOW,
    ranked_backups=[quote()],
    policy=RecoveryPolicy(),
    recovery_attempts=0,
    current_fare_inr=320,
    cancellation_fee_upper_bound_inr=32,
)
CANCELLED = {
    "active_ride": None,
    "last_ride": RIDE.model_copy(update={"state": RideState.DRIVER_CANCELLED}),
    "cancellation_fee_upper_bound_inr": 0,
}
RECENT = {"last_rejection_at": NOW - timedelta(seconds=30), "last_proposal_band": RiskBand.MEDIUM}
AUTO = RecoveryPolicy(auto_rebook_on_confirmed_driver_cancel=True)
CHAT = ChatSignal(label="REQUEST_RIDER_CANCEL", evidence="Cancel kar do", source="test", is_advisory=True)
CASES = [
    ("tight_deadline", {}, DecisionType.REQUEST_APPROVAL, "SWITCH_IMPROVES_PICKUP_COST"),
    (
        "loose_deadline",
        {"need_by": NOW + timedelta(seconds=900)},
        DecisionType.SEARCH_BACKUP,
        "INSUFFICIENT_IMPROVEMENT",
    ),
    ("recent_rejection", RECENT, DecisionType.SEARCH_BACKUP, "REJECTION_COOLDOWN"),
    (
        "band_rose",
        RECENT | {"risk": risk(RiskBand.HIGH)},
        DecisionType.REQUEST_APPROVAL,
        "SWITCH_IMPROVES_PICKUP_COST",
    ),
    (
        "cooldown_elapsed",
        RECENT | {"last_rejection_at": NOW - timedelta(seconds=120)},
        DecisionType.REQUEST_APPROVAL,
        "SWITCH_IMPROVES_PICKUP_COST",
    ),
    (
        "fee_exceeds_limit",
        {"policy": RecoveryPolicy(max_cancellation_fee_inr=31)},
        DecisionType.SEARCH_BACKUP,
        "CANCELLATION_FEE_LIMIT",
    ),
    (
        "fee_equals_limit",
        {"policy": RecoveryPolicy(max_cancellation_fee_inr=32)},
        DecisionType.REQUEST_APPROVAL,
        "SWITCH_IMPROVES_PICKUP_COST",
    ),
    (
        "opted_out_confirmed_cancel",
        CANCELLED,
        DecisionType.REQUEST_APPROVAL,
        "AUTOMATIC_REBOOKING_NOT_ENABLED",
    ),
    (
        "opted_in_confirmed_cancel",
        CANCELLED | {"policy": AUTO},
        DecisionType.REBOOK_AFTER_CANCEL,
        "CONFIRMED_DRIVER_CANCELLATION",
    ),
    ("cancel_no_backup", CANCELLED | {"ranked_backups": []}, DecisionType.STOP, "NO_ELIGIBLE_BACKUP"),
    ("cancel_retry_cap", CANCELLED | {"recovery_attempts": 2}, DecisionType.STOP, "POLICY_RETRY_LIMIT"),
    ("preemptive_retry_cap", {"recovery_attempts": 2}, DecisionType.SEARCH_BACKUP, "POLICY_RETRY_LIMIT"),
    ("unknown_risk", {"risk": risk(RiskBand.UNKNOWN)}, DecisionType.MONITOR, "TELEMETRY_UNRELIABLE"),
    (
        "low_risk_with_chat",
        {"risk": risk(RiskBand.LOW), "chat_signal": CHAT},
        DecisionType.MONITOR,
        "NO_SWITCH_INDICATED",
    ),
    (
        "terminal",
        CANCELLED | {"journey_state": JourneyState.USER_CANCELLED, "policy": AUTO},
        DecisionType.STOP,
        "JOURNEY_STOPPED",
    ),
    (
        "arrived",
        {"active_ride": RIDE.model_copy(update={"state": RideState.DRIVER_ARRIVED})},
        DecisionType.STOP,
        "DRIVER_ARRIVED",
    ),
    (
        "fare_over_cap",
        {"ranked_backups": [quote(fare=651)]},
        DecisionType.SEARCH_BACKUP,
        "NO_ELIGIBLE_BACKUP",
    ),
    (
        "expired_quote",
        {"ranked_backups": [quote(valid_until=NOW)]},
        DecisionType.SEARCH_BACKUP,
        "NO_ELIGIBLE_BACKUP",
    ),
    (
        "reconciling_cancel",
        CANCELLED | {"journey_state": JourneyState.RECONCILING, "policy": AUTO},
        DecisionType.MONITOR,
        "RECONCILIATION_PENDING",
    ),
    (
        "active_ride_supersedes_last_cancel",
        {"last_ride": CANCELLED["last_ride"], "policy": AUTO},
        DecisionType.REQUEST_APPROVAL,
        "SWITCH_IMPROVES_PICKUP_COST",
    ),
    (
        "margin_exactly_equal",
        {"need_by": NOW + timedelta(seconds=900), "cancellation_fee_upper_bound_inr": 10},
        DecisionType.SEARCH_BACKUP,
        "INSUFFICIENT_IMPROVEMENT",
    ),
]


@pytest.mark.parametrize(
    "updates,action,reason",
    [pytest.param(changes, action, reason, id=name) for name, changes, action, reason in CASES],
)
def test_decision_table(updates, action, reason):
    result = decide(replace(BASE, **updates), CONFIG)
    assert (result.type, result.reasons) == (action, [reason])
    assert (result.candidate is not None) == (
        action in {DecisionType.REQUEST_APPROVAL, DecisionType.REBOOK_AFTER_CANCEL}
    )
    assert set(result.numbers) == {
        "wait_late_sec",
        "switch_late_sec",
        "wait_cost",
        "switch_cost",
        "seconds_until_need_by",
    }


def test_costs_include_redispatch_fare_fee_and_time_already_late():
    result = decide(
        replace(BASE, need_by=NOW - timedelta(seconds=10), ranked_backups=[quote(fare=340)]), CONFIG
    )
    assert result.numbers == {
        "wait_late_sec": 430,
        "switch_late_sec": 265,
        "wait_cost": 900,
        "switch_cost": 582,
        "seconds_until_need_by": -10,
    }
    assert result.to_deadline_event().recommendation == "PROPOSE_SWITCH"


@given(
    st.sampled_from([None, *RideState]),
    st.lists(st.integers(0, 2000), max_size=8),
    st.integers(1, 2000),
    st.booleans(),
    st.integers(0, 5),
)
def test_policy_never_rebooks_while_active_or_returns_an_over_budget_candidate(
    state, fares, cap, opted_in, attempts
):
    ctx = replace(
        BASE,
        active_ride=RIDE.model_copy(update={"state": state}) if state is not None else None,
        last_ride=CANCELLED["last_ride"],
        ranked_backups=[quote(fare=fare) for fare in fares],
        policy=RecoveryPolicy(max_total_fare_inr=cap, auto_rebook_on_confirmed_driver_cancel=opted_in),
        recovery_attempts=attempts,
    )
    result = decide(ctx, CONFIG)
    if state in ACTIVE_RIDE_STATES:
        assert result.type != DecisionType.REBOOK_AFTER_CANCEL
    if result.candidate:
        assert result.candidate.estimated_fare_inr <= cap


def test_cooldown_controls_new_proposals_after_stored_session_restore():
    journey = SimulationStore().create(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),
        scenario="S03",
        deterministic=True,
    )
    service = JourneyService()
    service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    service.tick(journey.id, 25, session=journey)
    assert journey.pending_backup is not None
    service.approve_switch(journey.id, False, "reject", session=journey)
    stored = StoredSession.model_validate(vars(journey)).model_dump_json()
    restored = StoredSession.model_validate_json(stored).restore()
    assert (restored.last_rejection_at, restored.last_proposal_band) == (journey.clock, RiskBand.HIGH)
    service.tick(restored.id, CONFIG.rejection_cooldown_seconds // 5 - 1, session=restored)
    assert restored.pending_backup is None and restored.decision.reasons == ["REJECTION_COOLDOWN"]
    service.tick(restored.id, 1, session=restored)
    assert restored.pending_backup is not None


def test_rank_backups_filters_and_uses_fictional_prior_for_ties():
    a, b, c, d = Provider
    offers = [
        quote(a, eta=100, fare=999),
        quote(b, eta=100, valid_until=NOW),
        quote(c, eta=100),
        quote(d, eta=100),
    ]
    args = {
        "now": NOW,
        "excluding_provider": None,
        "attempted_providers": {c},
        "provider_cooldowns": {d: NOW},
        "profiles": PROFILES,
        "config": CONFIG,
    }
    blocked = rank_backups(offers, policy=RecoveryPolicy(allow_same_provider_retry=False), **args)
    assert blocked.quotes == []
    allowed = rank_backups(offers, policy=RecoveryPolicy(allow_same_provider_retry=True), **args)
    assert allowed.quotes == [offers[2]]
    args["provider_cooldowns"] = {d: NOW - timedelta(seconds=CONFIG.provider_cooldown_seconds)}
    ranked = rank_backups(offers, policy=RecoveryPolicy(allow_same_provider_retry=True), **args)
    assert ranked.quotes == [offers[3], offers[2]]
    assert "simulator_prior" in ranked.why_selected and d.value in ranked.why_selected
