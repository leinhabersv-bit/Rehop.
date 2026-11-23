from __future__ import annotations
from fastapi import APIRouter
from app.schemas.models import JourneyCreate, QuoteRequest, BookRequest, ApprovalRequest, ActionRequest, TickRequest, ParseIntentRequest, DriverMessageRequest
from app.simulation.engine import LOCATIONS, SCENARIOS, SimulationError, store
from app.intelligence.llm import parse_ride_intent

router = APIRouter(prefix='/api/v1', tags=['RideRescue simulation'])


@router.post('/intent/parse')
def parse_intent(req: ParseIntentRequest):
    return parse_ride_intent(req.text, LOCATIONS)


@router.post('/journeys/{journey_id}/driver-message')
def driver_message(journey_id: str, req: DriverMessageRequest):
    with store.lock:
        return store.get(journey_id).driver_message(req.text,req.idempotency_key)


@router.get('/locations')
def locations():
    return {'locations': LOCATIONS, 'is_simulated': True}


@router.post('/quotes')
def get_quotes(req: QuoteRequest):
    # Quote previews are created from the journey. Use POST /journeys first
    # so quote IDs remain authoritative through booking.
    with store.lock:
        journey = store.create(JourneyCreate(pickup=req.pickup, dropoff=req.dropoff))
        return {'journey_id':journey.id, 'quotes':journey.quotes, 'is_simulated':True}


@router.post('/journeys', status_code=201)
def create_journey(req: JourneyCreate):
    with store.lock:
        return store.create(req).snapshot()


@router.get('/journeys/{journey_id}')
def get_journey(journey_id: str):
    with store.lock:
        return store.get(journey_id).snapshot()


@router.post('/journeys/{journey_id}/book')
def book(journey_id: str, req: BookRequest):
    with store.lock:
        return store.get(journey_id).book(req.quote_id, req.idempotency_key,
                                          expected_version=req.expected_version)


@router.get('/journeys/{journey_id}/events')
def events(journey_id: str, since_seq: int = 0):
    with store.lock:
        journey = store.get(journey_id)
        return {'journey_id': journey.id, 'events': [e for e in journey.events if e['seq'] > since_seq],
                'last_event_seq': len(journey.events)}


@router.post('/journeys/{journey_id}/rescue/approve')
def approve(journey_id: str, req: ApprovalRequest):
    with store.lock:
        return store.get(journey_id).approve_switch(req.approved,req.idempotency_key,
                                                    expected_version=req.expected_version)


@router.post('/journeys/{journey_id}/cancel')
def cancel(journey_id: str, req: ActionRequest):
    with store.lock:
        return store.get(journey_id).cancel(req.idempotency_key,expected_version=req.expected_version)


@router.post('/journeys/{journey_id}/pickup/confirm')
def confirm_pickup(journey_id: str, req: ActionRequest):
    with store.lock:
        return store.get(journey_id).confirm_pickup(req.idempotency_key, expected_version=req.expected_version)


@router.post('/journeys/{journey_id}/tick', description='Development-only simulated clock advancement')
def tick_journey(journey_id: str, req: TickRequest):
    with store.lock:
        return store.get(journey_id).tick(req.steps)


@router.get('/scenarios')
def scenarios():
    return {'scenarios':[{'id':sid,'name':name} for sid,name in SCENARIOS.items()], 'is_simulated':True}


@router.post('/scenarios/{scenario_id}/run')
def run_scenario(scenario_id: str, seed: int = 2026):
    if scenario_id not in SCENARIOS:
        raise SimulationError('SCENARIO_NOT_FOUND','Unknown simulator scenario.',status=404)
    with store.lock:
        policy = {'max_total_fare_inr': 330} if scenario_id == 'S07' else {}
        request = JourneyCreate(pickup=LOCATIONS[0],dropoff=LOCATIONS[1],policy=policy)
        if scenario_id == 'S16':
            from datetime import timedelta
            from app.simulation.engine import BASE_TIME
            request.need_by = BASE_TIME + timedelta(minutes=5)
        journey = store.create(request, scenario=scenario_id, seed=seed)
        if scenario_id != 'S12':
            primary = next(q for q in journey.quotes if q['provider']=='PROVIDER_A')
            journey.book(primary['quote_id'], f'scenario_initial_{scenario_id}')
        return journey.snapshot()


@router.post('/scenarios/{scenario_id}/tick')
def tick_scenario(scenario_id: str, req: TickRequest):
    with store.lock:
        journey_id = store.last_scenario.get(scenario_id)
        if not journey_id:
            raise SimulationError('SCENARIO_NOT_STARTED','Start this scenario before ticking.',status=404)
        return store.get(journey_id).tick(req.steps)
