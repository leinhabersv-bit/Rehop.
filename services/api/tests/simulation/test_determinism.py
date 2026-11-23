from app.schemas.models import JourneyCreate
from app.simulation.engine import LOCATIONS, Session


def test_seeded_movement_reproducible_ignoring_ids():
    req = JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1])
    a = Session(req, scenario="S03", seed=42)
    b = Session(req, scenario="S03", seed=42)
    a.book(a.quotes[0].quote_id, "start-a")
    b.book(b.quotes[0].quote_id, "start-b")
    a.tick(19)
    b.tick(19)
    assert a.ride.distance_to_pickup_m == b.ride.distance_to_pickup_m
    assert a.risk == b.risk
