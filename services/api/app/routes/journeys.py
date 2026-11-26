from __future__ import annotations

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response

from app.intelligence.llm import parse_ride_intent
from app.schemas.domain import PlaybackState
from app.schemas.enums import Provider
from app.schemas.errors import ErrorEnvelope, SimulationError
from app.schemas.requests import (
    ActionRequest,
    ApprovalRequest,
    BookRequest,
    DriverMessageRequest,
    InjectRequest,
    JourneyCreate,
    ParseIntentRequest,
    PlayRequest,
    QuoteRequest,
    RecoveryPolicy,
    TickRequest,
)
from app.services.journey_service import JourneyService
from app.simulation.durable import HOSTED, open_ride
from app.simulation.engine import LOCATIONS, RANDOM_SCENARIO, SCENARIOS, store
from app.simulation.scenarios import SCRIPTS, script_for
from app.simulation.trip_duration import destination_playback

router = APIRouter(prefix="/api/v1", tags=["RideRescue simulation"])
journey_service = JourneyService()
IDEMPOTENCY_ERRORS = {
    409: {
        "model": ErrorEnvelope,
        "description": "The action conflicts with the current journey or reuses an idempotency key.",
        "x-error-codes": ["IDEMPOTENCY_KEY_REUSED"],
    }
}


@router.post("/intent/parse")
def parse_intent(req: ParseIntentRequest):
    return parse_ride_intent(req.text, LOCATIONS).model_dump(mode="json")


@router.post("/journeys/{journey_id}/driver-message", responses=IDEMPOTENCY_ERRORS)
def driver_message(journey_id: str, req: DriverMessageRequest):
    return journey_service.driver_message(journey_id, req.text, req.idempotency_key).model_dump(mode="json")


@router.get("/locations")
def locations():
    return {"locations": [location.model_dump(mode="json") for location in LOCATIONS], "is_simulated": True}


@router.post("/quotes")
def get_quotes(req: QuoteRequest):
    # Quote previews are created from the journey. Use POST /journeys first
    # so quote IDs remain authoritative through booking.
    journey = journey_service.create(JourneyCreate(pickup=req.pickup, dropoff=req.dropoff))
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
    return journey_service.create(req, scenario=scenario).snapshot().model_dump(mode="json")


@router.get("/journeys/{journey_id}")
def get_journey(journey_id: str):
    with open_ride(journey_id) as journey:
        return journey.snapshot().model_dump(mode="json")


@router.post(
    "/journeys/{journey_id}/book",
    responses={
        409: {**IDEMPOTENCY_ERRORS[409], "x-error-codes": ["IDEMPOTENCY_KEY_REUSED", "BOOKING_FAILED"]}
    },
)
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
    return journey_service.book(
        journey_id,
        req.quote_id,
        req.idempotency_key,
        expected_version=req.expected_version,
        rider_id=rider_id,
        recent_ids=recent_ids,
    ).model_dump(mode="json")


EVENT_ETAG = {"ETag": {"schema": {"type": "string"}, "description": "Validator for this event cursor."}}


@router.get(
    "/journeys/{journey_id}/events",
    responses={
        200: {"headers": EVENT_ETAG},
        304: {"description": "No change since the supplied validator.", "headers": EVENT_ETAG},
    },
)
def events(
    journey_id: str,
    response: Response,
    since_seq: int = 0,
    if_none_match: Annotated[str | None, Header()] = None,
):
    with open_ride(journey_id) as journey:
        last_seq = journey.last_seq()
        etag = f'"{journey.id}:{since_seq}:{last_seq}"'
        headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
        if if_none_match and any(
            tag.strip().removeprefix("W/") in {"*", etag} for tag in if_none_match.split(",")
        ):
            return Response(status_code=304, headers=headers)
        response.headers.update(headers)
        return {
            "journey_id": journey.id,
            "events": [e.model_dump(mode="json") for e in journey.list_events(since_seq)],
            "last_event_seq": last_seq,
        }


@router.post("/journeys/{journey_id}/play")
def play(journey_id: str, req: PlayRequest) -> PlaybackState:
    return journey_service.play(journey_id, req.speed)


@router.post("/journeys/{journey_id}/pause")
def pause(journey_id: str) -> PlaybackState:
    return journey_service.pause(journey_id)


@router.post(
    "/sim/journeys/{journey_id}/inject",
    responses={404: {"description": "Simulation development endpoint disabled or journey missing."}},
)
def inject(journey_id: str, req: InjectRequest):
    return journey_service.inject(journey_id, req).model_dump(mode="json")


@router.post("/journeys/{journey_id}/rescue/approve", responses=IDEMPOTENCY_ERRORS)
def approve(journey_id: str, req: ApprovalRequest):
    return journey_service.approve_switch(
        journey_id,
        req.approved,
        req.idempotency_key,
        expected_version=req.expected_version,
    ).model_dump(mode="json")


@router.post("/journeys/{journey_id}/cancel", responses=IDEMPOTENCY_ERRORS)
def cancel(journey_id: str, req: ActionRequest):
    return journey_service.cancel(
        journey_id,
        req.idempotency_key,
        expected_version=req.expected_version,
    ).model_dump(mode="json")


@router.post("/journeys/{journey_id}/pickup/confirm", responses=IDEMPOTENCY_ERRORS)
def confirm_pickup(journey_id: str, req: ActionRequest):
    return journey_service.confirm_pickup(
        journey_id,
        req.idempotency_key,
        expected_version=req.expected_version,
        trip_duration=destination_playback,
    ).model_dump(mode="json")


@router.post("/journeys/{journey_id}/tick", description="Development-only simulated clock advancement")
def tick_journey(journey_id: str, req: TickRequest):
    return journey_service.tick(journey_id, req.steps).model_dump(mode="json")


@router.get("/scenarios")
def scenarios():
    available = {**SCENARIOS, RANDOM_SCENARIO: "Randomized pickup"}
    return {"scenarios": [{"id": sid, "name": name} for sid, name in available.items()], "is_simulated": True}


@router.post("/scenarios/{scenario_id}/run")
def run_scenario(scenario_id: str, seed: int = 2026):
    if scenario_id not in SCRIPTS:
        raise SimulationError("SCENARIO_NOT_FOUND", "Unknown simulator scenario.", status=404)
    with store.lock:
        script = script_for(scenario_id)
        policy = RecoveryPolicy(
            auto_rebook_on_confirmed_driver_cancel=script.auto_rebook,
            max_total_fare_inr=script.fare_cap,
        )
        request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1], policy=policy)
        for injection in script.injections_for("NEED_BY"):
            from datetime import timedelta

            from app.simulation.engine import BASE_TIME

            request.need_by = BASE_TIME + timedelta(minutes=injection.params["minutes"])
        journey = store.create(request, scenario=scenario_id, seed=seed, deterministic=True)
        if script.auto_book:
            primary = next(q for q in journey.quotes if q.provider == Provider.PROVIDER_A)
            journey_service.book(journey.id, primary.quote_id, f"scenario_initial_{scenario_id}")
        store.last_scenario[scenario_id] = journey.id
        return journey.snapshot().model_dump(mode="json")


@router.post("/scenarios/{scenario_id}/tick")
def tick_scenario(scenario_id: str, req: TickRequest):
    with store.lock:
        journey_id = store.last_scenario.get(scenario_id)
        if not journey_id:
            raise SimulationError("SCENARIO_NOT_STARTED", "Start this scenario before ticking.", status=404)
        return journey_service.tick(journey_id, req.steps).model_dump(mode="json")
