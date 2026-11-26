"""Scenario behavior follows script data, including after hosted serialization."""

import pytest

from app.routes.journeys import run_scenario
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession, tracking
from app.simulation.engine import store
from app.simulation.scenarios import SCRIPTS

service = JourneyService()


@pytest.mark.parametrize("scenario_id", [f"S{number:02}" for number in range(1, 17)])
def test_script_behaves_identically_under_an_unrecognized_id(scenario_id, monkeypatch):
    alias = "RENAMED"
    monkeypatch.setitem(SCRIPTS, alias, SCRIPTS[scenario_id])

    def run(name):
        snapshot = run_scenario(name, seed=2026)
        session = store.get(snapshot["id"])
        # Persist the alias just as hosted mode persists the scenario identifier.
        session = StoredSession.model_validate_json(
            StoredSession.model_validate(session, from_attributes=True).model_dump_json()
        ).restore()
        service.tick(session.id, 25, session=session)
        if session.pending_backup:
            service.approve_switch(session.id, True, "approve", session=session)
        events = [
            event.model_dump_json().replace(session.id, "JOURNEY").replace(name, "SCRIPT")
            for event in session.events
        ]
        return events, session.state, tracking(session)

    assert run(alias) == run(scenario_id)
