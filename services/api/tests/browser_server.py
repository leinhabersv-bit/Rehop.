"""FastAPI entry point for browser tests that need repeatable provider behavior."""

from functools import partial

from app.main import app as app
from app.routes.journeys import journey_service

journey_service.create = partial(journey_service.create, profiled=False)
