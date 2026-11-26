from datetime import timedelta

import pytest

from app.domain.errors import SimulationError
from app.schemas.enums import JourneyState
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.services.journey_service import JourneyService
from app.simulation.engine import BASE_TIME, LOCATIONS, SCENARIOS, SimulationStore
from app.simulation.replay import replay_from_events

service = JourneyService()


def scenario_run(store, scenario, seed):
    request = JourneyCreate(
        pickup=LOCATIONS[0],
        dropoff=LOCATIONS[1],
        need_by=BASE_TIME + timedelta(minutes=5 if scenario == "S16" else 20),
        policy=RecoveryPolicy(
            auto_rebook_on_confirmed_driver_cancel=scenario in {"S04", "S05", "S06", "S07"},
            max_total_fare_inr=330 if scenario == "S07" else 650,
        ),
    )
    journey = store.create(request, scenario=scenario, seed=seed, deterministic=True)
    if scenario == "S12":
        with pytest.raises(SimulationError) as error:
            service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
        assert error.value.code == "BOOKING_UNCONFIRMED"
    else:
        service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    if scenario == "S11":
        service.tick(journey.id, 10, session=journey)
        service.cancel(journey.id, "cancel", session=journey)
    service.tick(journey.id, 25, session=journey)
    if scenario in {"S14", "S15"}:
        service.approve_switch(journey.id, True, "approve", session=journey)
    if scenario == "S01":
        service.confirm_pickup(journey.id, "board", session=journey)
    return journey


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_seeded_runs_have_identical_events_and_replay_final_status(scenario, monkeypatch):
    def unexpected_llm(*args):
        pytest.fail("Deterministic scenario runs must use offline language processing")

    monkeypatch.setattr("app.intelligence.llm.client.complete_json", unexpected_llm)
    first = scenario_run(SimulationStore(), scenario, 2026)
    second = scenario_run(SimulationStore(), scenario, 2026)
    assert first.id == second.id == f"journey_{scenario}_2026_1"
    assert first.events == second.events
    for event in first.events:
        assert event.event_id == f"{first.id}_evt_{event.seq:04}"
        elapsed = event.timestamp - BASE_TIME
        assert elapsed >= timedelta(0)
        assert elapsed % timedelta(seconds=5) == timedelta(0)
    replayed = replay_from_events(first.id, first._event_store)
    assert replayed.state == first.state
    assert replayed.active_ride_id == first.snapshot().active_ride_id


def test_repeated_starts_preserve_previous_run_and_default_replay_uses_the_event_log(monkeypatch):
    store = SimulationStore()
    monkeypatch.setattr("app.simulation.durable.store", store)
    first = scenario_run(store, "S01", 2026)
    second = scenario_run(store, "S01", 2026)
    assert first.id == "journey_S01_2026_1"
    assert second.id == "journey_S01_2026_2"
    assert store.get(first.id) is first
    replayed = replay_from_events(first.id)
    assert replayed.state == JourneyState.PICKUP_CONFIRMED
    assert replayed.active_ride_id == first.snapshot().active_ride_id
