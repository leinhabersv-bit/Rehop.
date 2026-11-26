"""Check repeatability across the scripted and sampled simulation paths."""

from datetime import timedelta

import pytest

from app.domain.errors import SimulationError
from app.schemas.enums import Provider, RideState
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.services.journey_service import JourneyService
from app.simulation.engine import BASE_TIME, LOCATIONS, SimulationStore
from app.simulation.scenarios import RANDOM_SCENARIO, SCENARIOS, script_for

SEEDS = range(1, 21)


def run_journey(scenario: str, seed: int):
    script = script_for(scenario)
    request = JourneyCreate(
        pickup=LOCATIONS[0],
        dropoff=LOCATIONS[1],
        policy=RecoveryPolicy(
            auto_rebook_on_confirmed_driver_cancel=script.auto_rebook,
            max_total_fare_inr=script.fare_cap,
        ),
    )
    for injection in script.injections_for("NEED_BY"):
        request.need_by = BASE_TIME + timedelta(minutes=injection.params["minutes"])
    journey = SimulationStore().create(request, scenario=scenario, seed=seed, deterministic=True)
    service = JourneyService()
    primary = next(quote for quote in journey.quotes if quote.provider == Provider.PROVIDER_A)
    try:
        service.book(journey.id, primary.quote_id, "book", session=journey)
    except SimulationError as error:
        if scenario == RANDOM_SCENARIO and error.code in {"BOOKING_FAILED", "BOOKING_UNCONFIRMED"}:
            pass
        elif scenario != "S12" or error.code != "BOOKING_UNCONFIRMED":
            raise

    if scenario == "S11":
        service.tick(journey.id, 10, session=journey)
        service.cancel(journey.id, "cancel", session=journey)
    service.tick(journey.id, 120 if scenario == RANDOM_SCENARIO else 25, session=journey)
    if journey.pending_backup:
        try:
            service.approve_switch(journey.id, True, "approve", session=journey)
        except SimulationError as error:
            if scenario != RANDOM_SCENARIO or error.code != "CANCEL_UNCONFIRMED":
                raise
    if journey.ride and journey.ride.state == RideState.DRIVER_ARRIVED:
        service.confirm_pickup(journey.id, "board", session=journey)
    return journey


@pytest.mark.parametrize("scenario", [*SCENARIOS, RANDOM_SCENARIO])
@pytest.mark.parametrize("seed", SEEDS)
def test_same_seed_repeats_full_event_list(scenario, seed):
    first = run_journey(scenario, seed)
    second = run_journey(scenario, seed)
    assert [event.model_dump(mode="json") for event in first.list_events()] == [
        event.model_dump(mode="json") for event in second.list_events()
    ]


def test_random_different_seeds_change_event_content():
    streams = []
    for seed in SEEDS:
        journey = run_journey(RANDOM_SCENARIO, seed)
        # The seed is part of the journey ID and all derived IDs. Mask it so
        # the stream must differ in event data, timing, or order.
        streams.append(
            [event.model_dump_json().replace(journey.id, "JOURNEY") for event in journey.list_events()]
        )
    differences = sum(
        first != second for first, second in zip(streams, streams[1:] + streams[:1], strict=True)
    )
    assert differences >= 15, f"Only {differences} of 20 RANDOM seed pairs differed"
