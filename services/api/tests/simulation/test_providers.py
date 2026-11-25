import re
from collections import Counter
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from random import Random

import pytest
from fastapi.testclient import TestClient

from app.domain.errors import SimulationError
from app.main import app
from app.schemas.domain import Ride
from app.schemas.enums import EventType, GpsQuality, JourneyState, OpStatus, Provider, RideState
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.simulation.durable import StoredSession, occupies_booking
from app.simulation.engine import BASE_TIME, LOCATIONS, SCENARIOS, Session, store
from app.simulation.profiles import PROFILES
from app.simulation.providers import ScenarioOverrides, SimulatedMobilityAdapter
from app.storage.ids import IdFactory

PROVIDER = Provider.PROVIDER_A
PROFILE = PROFILES[PROVIDER]


def proposal(quote, index=1):
    return Ride(
        ride_id=f"ride_{index}",
        journey_id="journey_test",
        provider=quote.provider,
        quote_id=quote.quote_id,
        state=RideState.DRIVER_EN_ROUTE,
        booked_at=BASE_TIME,
        driver_id=f"SIM_DRIVER_{index}",
        distance_to_pickup_m=2200,
        eta_sec=quote.pickup_eta_sec,
        last_position_at=BASE_TIME,
        cancellation_fee_inr=None,
        gps_quality=GpsQuality.GOOD,
        is_simulated=True,
    )


def test_seed_repeats_quotes_and_operation_results():
    def run():
        adapter = SimulatedMobilityAdapter(PROFILE, Random("42:journey_test:PROVIDER_A"))
        quotes = [adapter.search("journey_test", BASE_TIME, distance) for distance in (3, 12, 31)]
        results = []
        for index in range(100):
            quote = quotes[index % len(quotes)]
            ride = proposal(quote, index)
            results.append(
                (
                    adapter.confirm(quote, BASE_TIME, ride),
                    adapter.cancel(ride.ride_id),
                    adapter.status(ride.ride_id),
                )
            )
        return quotes, results

    quotes, results = run()
    assert (quotes, results) == run()
    for distance, quote in zip((3, 12, 31), quotes, strict=True):
        base_fare = PROFILE.base_fare_inr + distance * PROFILE.fare_per_km_inr
        assert 0.92 * base_fare - 0.5 <= quote.estimated_fare_inr <= 1.08 * base_fare + 0.5
        assert quote.expires_at == BASE_TIME + timedelta(seconds=PROFILE.quote_ttl_sec)
    assert quotes[0].estimated_fare_inr < quotes[1].estimated_fare_inr < quotes[2].estimated_fare_inr


@pytest.mark.parametrize("provider", PROFILES)
def test_confirm_rates_match_profile_over_10000_draws(provider):
    profile = PROFILES[provider]
    adapter = SimulatedMobilityAdapter(profile, Random(f"confirm-rates:{provider.value}"), name=provider)
    quote = adapter.search("journey_test", BASE_TIME, 10)
    ride = proposal(quote)
    samples = 10_000
    outcomes = Counter(
        adapter.confirm(quote, BASE_TIME, ride.model_copy(update={"ride_id": f"ride_{index}"})).status
        for index in range(samples)
    )
    assert outcomes[OpStatus.FAILED] / samples == pytest.approx(profile.p_confirm_fail, abs=0.015)
    assert outcomes[OpStatus.UNKNOWN] / samples == pytest.approx(profile.p_confirm_unknown, abs=0.015)
    assert sum(outcomes.values()) == samples


def test_status_reveals_both_hidden_confirmation_outcomes_and_a_committed_cancellation():
    profile = replace(PROFILE, p_confirm_fail=0, p_confirm_unknown=1, p_cancel_unknown=1)
    adapter = SimulatedMobilityAdapter(profile, Random(48))
    quote = adapter.search("journey_test", BASE_TIME, 10)
    assert adapter.status("missing") is None
    true_states = set()
    for index in range(20):
        ride = proposal(quote, index)
        result = adapter.confirm(quote, BASE_TIME, ride)
        assert result.status == OpStatus.UNKNOWN
        assert result.ride is None
        state = adapter.status(ride.ride_id).state
        true_states.add(state)
        if state == RideState.DRIVER_EN_ROUTE:
            assert adapter.cancel(ride.ride_id).status == OpStatus.UNKNOWN
            assert adapter.status(ride.ride_id).state == RideState.RIDER_CANCELLED
            assert adapter.cancel(ride.ride_id).status == OpStatus.CONFIRMED
        else:
            assert adapter.cancel(ride.ride_id).status == OpStatus.FAILED
            assert adapter.status(ride.ride_id).state == RideState.FAILED
    assert true_states == {RideState.DRIVER_EN_ROUTE, RideState.FAILED}


def test_expired_quote_is_refused_without_a_draw_or_consuming_override():
    rng = Random(42)
    overrides = ScenarioOverrides(next_confirm={PROVIDER: OpStatus.CONFIRMED})
    adapter = SimulatedMobilityAdapter(PROFILE, rng, overrides=overrides)
    quote = adapter.search("journey_test", BASE_TIME, 10)
    ride = proposal(quote)
    rng_state = rng.getstate()
    assert not adapter.select(quote, quote.expires_at)
    assert not adapter.init(quote, quote.expires_at)
    assert adapter.confirm(quote, quote.expires_at, ride).status == OpStatus.FAILED
    assert adapter.status(ride.ride_id) is None
    assert rng.getstate() == rng_state
    assert overrides.next_confirm == {PROVIDER: OpStatus.CONFIRMED}


def test_overrides_win_without_sampling_and_are_consumed_once():
    rng = Random(42)
    profile = replace(PROFILE, p_confirm_fail=1, p_confirm_unknown=0, p_cancel_unknown=1)
    overrides = ScenarioOverrides(
        next_confirm={PROVIDER: OpStatus.CONFIRMED}, next_cancel={PROVIDER: OpStatus.FAILED}
    )
    adapter = SimulatedMobilityAdapter(profile, rng, overrides=overrides)
    quote = adapter.search("journey_test", BASE_TIME, 10)
    ride = proposal(quote)
    rng_state = rng.getstate()
    assert adapter.confirm(quote, BASE_TIME, ride).status == OpStatus.CONFIRMED
    assert adapter.cancel(ride.ride_id).status == OpStatus.FAILED
    assert adapter.status(ride.ride_id).state == RideState.DRIVER_EN_ROUTE
    assert rng.getstate() == rng_state
    assert adapter.cancel(ride.ride_id).status == OpStatus.UNKNOWN
    assert adapter.confirm(quote, BASE_TIME, proposal(quote, 2)).status == OpStatus.FAILED


def roundtrip(session):
    payload = StoredSession.model_validate(vars(session)).model_dump_json()
    return StoredSession.model_validate_json(payload).restore()


def test_profiled_ticks_match_after_restoring_from_storage_every_tick(monkeypatch):
    monkeypatch.setitem(PROFILES, PROVIDER, replace(PROFILE, driver_cancel_hazard_per_min=0))
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])

    def start():
        session = Session(request, seed=89, scenario_ids=IdFactory(), profiled=True)
        session.provider_overrides.next_confirm[PROVIDER] = OpStatus.CONFIRMED
        session.book(session.quotes[0].quote_id, "initial-book")
        return session

    uninterrupted = start()
    restarted = start()
    initial_draws = uninterrupted.provider_states[PROVIDER].draw_index
    uninterrupted.tick(20)
    for _ in range(20):
        restarted.tick(1)
        restarted = roundtrip(restarted)
    assert [event.model_dump(mode="json") for event in uninterrupted.events] == [
        event.model_dump(mode="json") for event in restarted.events
    ]
    assert uninterrupted.snapshot() == restarted.snapshot()
    assert uninterrupted.provider_states == restarted.provider_states
    assert restarted.provider_states[PROVIDER].draw_index > initial_draws
    assert any(event.type == EventType.TELEMETRY_UPDATED for event in restarted.events)


def test_unacknowledged_booking_survives_restore_and_stop_verifies_cancellation(monkeypatch):
    profile = replace(PROFILE, p_confirm_fail=0, p_confirm_unknown=1, p_cancel_unknown=1)
    monkeypatch.setitem(PROFILES, PROVIDER, profile)
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    for seed in range(20):
        session = Session(request, seed=seed, scenario_ids=IdFactory(), profiled=True)
        with pytest.raises(SimulationError, match="timed out"):
            session.book(session.quotes[0].quote_id, "try-booking")
        ride_id = session.unconfirmed_ride.ride_id
        if session.adapters[PROVIDER].status(ride_id).state == RideState.DRIVER_EN_ROUTE:
            break
    else:
        pytest.fail("Expected a sampled booking to commit despite its missing acknowledgement")

    restored = roundtrip(session)
    assert restored.adapters[PROVIDER].status(ride_id).state == RideState.DRIVER_EN_ROUTE
    assert occupies_booking(restored)
    with pytest.raises(SimulationError, match="confirmation missing"):
        restored.cancel("try-stop")
    restored = roundtrip(restored)
    assert restored.adapters[PROVIDER].status(ride_id).state == RideState.RIDER_CANCELLED
    assert occupies_booking(restored)
    stopped = restored.cancel("verify-stop")
    assert stopped.state == JourneyState.USER_CANCELLED
    assert stopped.last_ride.state == RideState.RIDER_CANCELLED
    assert not occupies_booking(restored)


def test_default_booking_api_exposes_and_replays_sampled_failure(monkeypatch):
    monkeypatch.setitem(PROFILES, PROVIDER, replace(PROFILE, p_confirm_fail=1, p_confirm_unknown=0))
    with TestClient(app) as client:
        started = (
            client.post(
                "/api/v1/journeys",
                json={"pickup": LOCATIONS[0].model_dump(), "dropoff": LOCATIONS[1].model_dump()},
            )
            .raise_for_status()
            .json()
        )
        url = f"/api/v1/journeys/{started['id']}"
        request = {"quote_id": started["quotes"][0]["quote_id"], "idempotency_key": "sampled-fail"}
        first = client.post(f"{url}/book", json=request)
        provider_state = store.get(started["id"]).provider_states[PROVIDER]
        draw_index = provider_state.draw_index
        second = client.post(f"{url}/book", json=request)
        assert first.status_code == second.status_code == 409
        assert first.json()["error"]["code"] == "BOOKING_FAILED"
        assert first.json() == second.json()
        assert provider_state.draw_index == draw_index
        assert client.get(url).raise_for_status().json()["active_ride_id"] is None


def test_scripted_quotes_keep_the_legacy_fares_etas_and_ttl():
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    expected_offers = [(320, 300), (285, 240), (360, 360), (395, 540)]
    for scenario in SCENARIOS:
        session = roundtrip(Session(request, scenario=scenario, scenario_ids=IdFactory()))
        for quote, (fare, eta) in zip(session.quotes, expected_offers, strict=True):
            if scenario == "S07" and quote.provider != PROVIDER:
                fare += 120
            assert (quote.estimated_fare_inr, quote.pickup_eta_sec) == (fare, eta)
            assert quote.expires_at == BASE_TIME + timedelta(seconds=30)
            refreshed = session.adapters[quote.provider].search(session.id, BASE_TIME, 70)
            assert refreshed == quote


def test_random_scenario_uses_provider_profiles(monkeypatch):
    monkeypatch.setitem(PROFILES, PROVIDER, replace(PROFILE, p_confirm_fail=1, p_confirm_unknown=0))
    with TestClient(app) as client:
        started = client.post("/api/v1/scenarios/RANDOM/run", params={"seed": 2026}).raise_for_status().json()
        assert started["scenario"] == "RANDOM"
        assert started["state"] == "WAITING_FOR_RIDE"
        quote = started["quotes"][0]
        assert quote["pickup_eta_sec"] == PROFILE.base_pickup_eta_sec
        response = client.post(
            f"/api/v1/journeys/{started['id']}/book",
            json={"quote_id": quote["quote_id"], "idempotency_key": "random-initial"},
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "BOOKING_FAILED"


@pytest.mark.parametrize(
    ("provider", "cancel_target", "stall_target"),
    [
        (Provider.PROVIDER_A, 0.08, 0.25),
        (Provider.PROVIDER_B, 0.06, 0.15),
        (Provider.PROVIDER_C, 0.18, 0.35),
        (Provider.PROVIDER_D, 0.03, 0.10),
    ],
)
def test_realised_pickup_incidence_matches_targets(provider, cancel_target, stall_target, record_property):
    request = JourneyCreate(
        pickup=LOCATIONS[0],
        dropoff=LOCATIONS[1],
        policy=RecoveryPolicy(max_recovery_attempts=0),
    )
    ids = IdFactory()
    cancellations = stalls = 0
    samples = 2_000
    for _ in range(samples):
        session = Session(request, seed=2026, scenario_ids=ids, profiled=True)
        # Measure pickups conditional on a confirmed booking. Only the initial confirm is forced.
        session.provider_overrides.next_confirm[provider] = OpStatus.CONFIRMED
        quote = next(quote for quote in session.quotes if quote.provider == provider)
        started = session.book(quote.quote_id, "initial")
        distance = started.active_ride.distance_to_pickup_m
        session.tick(180)
        while session.ride and session.ride.state == RideState.DRIVER_EN_ROUTE:
            session.tick(180)
        cancellations += (
            session.last_ride is not None and session.last_ride.state == RideState.DRIVER_CANCELLED
        )
        for event in session.events:
            if event.type == EventType.TELEMETRY_UPDATED:
                observed = event.payload["distance_to_pickup_m"]
                if observed == distance:
                    stalls += 1
                    break
                distance = observed

    record_property("cancellation_rate", cancellations / samples)
    record_property("stall_rate", stalls / samples)
    assert cancellations / samples == pytest.approx(cancel_target, abs=0.03)
    assert stalls / samples == pytest.approx(stall_target, abs=0.03)


def test_app_does_not_use_module_level_random_calls():
    app_dir = Path(__file__).resolve().parents[2] / "app"
    pattern = re.compile(
        r"(?<![\w.])random\.[A-Za-z_]\w*\s*\(|\bimport random\b|\bfrom random import (?!Random\s*$)"
    )
    violations = [
        f"{path.relative_to(app_dir)}:{number}"
        for path in sorted(app_dir.rglob("*.py"))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if pattern.search(line)
    ]
    assert not violations, violations
