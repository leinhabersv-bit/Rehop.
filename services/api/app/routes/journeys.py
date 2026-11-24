from __future__ import annotations

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, Query

from app.intelligence.llm import parse_ride_intent
from app.schemas.enums import Provider
from app.schemas.errors import SimulationError
from app.schemas.requests import (
    ActionRequest,
    ApprovalRequest,
    BookRequest,
    DriverMessageRequest,
    JourneyCreate,
    ParseIntentRequest,
    QuoteRequest,
    RecoveryPolicy,
    TickRequest,
)
from app.simulation.durable import HOSTED, create_ride, open_ride
from app.simulation.engine import LOCATIONS, SCENARIOS, store

router = APIRouter(prefix="/api/v1", tags=["RideRescue simulation"])


@router.post("/intent/parse")
def parse_intent(req: ParseIntentRequest):
    return parse_ride_intent(req.text, LOCATIONS).model_dump(mode="json")


@router.post("/journeys/{journey_id}/driver-message")
def driver_message(journey_id: str, req: DriverMessageRequest):
    with open_ride(journey_id) as journey:
        return journey.driver_message(req.text, req.idempotency_key).model_dump(mode="json")


@router.get("/locations")
def locations():
    return {"locations": [location.model_dump(mode="json") for location in LOCATIONS], "is_simulated": True}


@router.post("/quotes")
def get_quotes(req: QuoteRequest):
    # Quote previews are created from the journey. Use POST /journeys first
    # so quote IDs remain authoritative through booking.
    journey = create_ride(JourneyCreate(pickup=req.pickup, dropoff=req.dropoff))
    return {
        "journey_id": journey.id,
        "quotes": [quote.model_dump(mode="json") for quote in journey.quotes],
        "is_simulated": True,
    }


@router.post("/journeys", status_code=201)
def create_journey(
    req: JourneyCreate,
    scenario: Annotated[Literal["S01", "S03"], Query(description="Simulated pickup behavior.")] = "S01",
):
    return create_ride(req, scenario=scenario).snapshot().model_dump(mode="json")


@router.get("/journeys/{journey_id}")
def get_journey(journey_id: str):
    with open_ride(journey_id) as journey:
        return journey.snapshot().model_dump(mode="json")


@router.post("/journeys/{journey_id}/book")
def book(
    journey_id: str,
    req: BookRequest,
    x_ride_rider: Annotated[UUID | None, Header()] = None,
    x_ride_recent: Annotated[str, Header(max_length=167)] = "",
):
    if HOSTED and x_ride_rider is None:
        raise SimulationError(
            "RIDER_REQUIRED",
            "Reload the booking page before booking a ride.",
            status=428,
        )
    recent_ids = tuple(
        recent_id
        for recent_id in x_ride_recent.split(",")[:8]
        if re.fullmatch(r"journey_[a-f0-9]{12}", recent_id)
    )
    rider_id = str(x_ride_rider) if x_ride_rider else None
    with open_ride(journey_id, rider_id=rider_id, recent_ids=recent_ids) as journey:
        return journey.book(
            req.quote_id, req.idempotency_key, expected_version=req.expected_version
        ).model_dump(mode="json")


@router.get("/journeys/{journey_id}/events")
def events(journey_id: str, since_seq: int = 0):
    with open_ride(journey_id) as journey:
        return {
            "journey_id": journey.id,
            "events": [e.model_dump(mode="json") for e in journey.events if e.seq > since_seq],
            "last_event_seq": len(journey.events),
        }


@router.post("/journeys/{journey_id}/rescue/approve")
def approve(journey_id: str, req: ApprovalRequest):
    with open_ride(journey_id) as journey:
        return journey.approve_switch(
            req.approved, req.idempotency_key, expected_version=req.expected_version
        ).model_dump(mode="json")


@router.post("/journeys/{journey_id}/cancel")
def cancel(journey_id: str, req: ActionRequest):
    with open_ride(journey_id) as journey:
        return journey.cancel(req.idempotency_key, expected_version=req.expected_version).model_dump(
            mode="json"
        )


@router.post("/journeys/{journey_id}/pickup/confirm")
def confirm_pickup(journey_id: str, req: ActionRequest):
    with open_ride(journey_id) as journey:
        return journey.confirm_pickup(req.idempotency_key, expected_version=req.expected_version).model_dump(
            mode="json"
        )


@router.post("/journeys/{journey_id}/tick", description="Development-only simulated clock advancement")
def tick_journey(journey_id: str, req: TickRequest):
    with store.lock:
        return store.get(journey_id).tick(req.steps).model_dump(mode="json")


@router.get("/scenarios")
def scenarios():
    return {"scenarios": [{"id": sid, "name": name} for sid, name in SCENARIOS.items()], "is_simulated": True}


@router.post("/scenarios/{scenario_id}/run")
def run_scenario(scenario_id: str, seed: int = 2026):
    if scenario_id not in SCENARIOS:
        raise SimulationError("SCENARIO_NOT_FOUND", "Unknown simulator scenario.", status=404)
    with store.lock:
        policy = RecoveryPolicy(
            auto_rebook_on_confirmed_driver_cancel=scenario_id in {"S04", "S05", "S06", "S07"},
            max_total_fare_inr=330 if scenario_id == "S07" else 650,
        )
        request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], policy=policy)
        if scenario_id == "S16":
            from datetime import timedelta

            from app.simulation.engine import BASE_TIME

            request.need_by = BASE_TIME + timedelta(minutes=5)
        journey = store.create(request, scenario=scenario_id, seed=seed)
        if scenario_id != "S12":
            primary = next(q for q in journey.quotes if q.provider == Provider.PROVIDER_A)
            journey.book(primary.quote_id, f"scenario_initial_{scenario_id}")
        store.last_scenario[scenario_id] = journey.id
        return journey.snapshot().model_dump(mode="json")


@router.post("/scenarios/{scenario_id}/tick")
def tick_scenario(scenario_id: str, req: TickRequest):
    with store.lock:
        journey_id = store.last_scenario.get(scenario_id)
        if not journey_id:
            raise SimulationError("SCENARIO_NOT_STARTED", "Start this scenario before ticking.", status=404)
        return store.get(journey_id).tick(req.steps).model_dump(mode="json")
