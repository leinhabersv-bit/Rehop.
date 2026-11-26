from app.schemas.models import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.engine import LOCATIONS, Session

service = JourneyService()


def test_seeded_movement_reproducible_ignoring_ids():
    req = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    a = Session(req, scenario="S03", seed=42)
    b = Session(req, scenario="S03", seed=42)
    service.book(a.id, a.quotes[0].quote_id, "start-a", session=a)
    service.book(b.id, b.quotes[0].quote_id, "start-b", session=b)
    service.tick(a.id, 19, session=a)
    service.tick(b.id, 19, session=b)
    assert a.ride.distance_to_pickup_m == b.ride.distance_to_pickup_m
    assert a.risk == b.risk
