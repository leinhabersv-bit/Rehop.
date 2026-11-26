from app.schemas.requests import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, Session
from app.storage.ids import IdFactory

service = JourneyService()


def test_s03_thirty_ticks_survive_json_restore_after_every_tick():
    request = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    continuous = Session(request, scenario="S03", scenario_ids=IdFactory())
    restarted = Session(request, scenario="S03", scenario_ids=IdFactory())
    for journey in (continuous, restarted):
        service.book(journey.id, journey.quotes[0].quote_id, "initial", session=journey)
    service.tick(continuous.id, 30, session=continuous)
    for _ in range(30):
        service.tick(restarted.id, 1, session=restarted)
        payload = StoredSession.model_validate(vars(restarted)).model_dump_json()
        restarted = StoredSession.model_validate_json(payload).restore()
    assert continuous.events == restarted.events
    assert continuous.snapshot() == restarted.snapshot()
    assert continuous.driver_sim == restarted.driver_sim
    assert continuous.provider_states == restarted.provider_states
