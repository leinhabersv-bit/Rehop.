"""FastAPI entry point for browser tests that need repeatable provider behavior."""

from app.main import app as app
from app.routes import journeys
from app.simulation.engine import store


def scripted_ride(request, scenario="S01"):
    with store.lock:
        return store.create(request, scenario=scenario)


journeys.create_ride = scripted_ride
