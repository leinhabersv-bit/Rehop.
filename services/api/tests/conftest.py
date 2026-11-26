from dataclasses import replace

import pytest

from app.simulation.profiles import PROFILES


@pytest.fixture(autouse=True)
def disable_live_llm(monkeypatch):
    for name in ("LLM_API_KEY", "OPENAI_API_KEY", "DEMO_LIVE_LLM"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def steady_provider_profiles(monkeypatch):
    """Exercise API safety and persistence independently of simulated incidents."""
    for provider, profile in PROFILES.items():
        monkeypatch.setitem(
            PROFILES,
            provider,
            replace(
                profile,
                p_confirm_fail=0,
                p_confirm_unknown=0,
                p_cancel_unknown=0,
                driver_cancel_hazard_per_min=0,
                stall_hazard_per_min=0,
                detour_hazard_per_min=0,
                gps_dropout_hazard_per_min=0,
            ),
        )
