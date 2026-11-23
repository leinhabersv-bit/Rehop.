"""Neutral ONDC/Beckn-shaped SIMULATOR adapters; NOT an ONDC network client.

Real protocol supports async search/on_search, select/on_select, init/on_init,
confirm/on_confirm, cancel/on_cancel, status/on_status, track/on_track.
Production would require registry onboarding, signatures, protocol validation,
network participants, payments and callback handling.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

PROVIDERS = ("PROVIDER_A", "PROVIDER_B", "PROVIDER_C", "PROVIDER_D")
BASE_OFFERS = {
    "PROVIDER_A": (320, 300),
    "PROVIDER_B": (285, 240),
    "PROVIDER_C": (360, 360),
    "PROVIDER_D": (395, 540),
}


class SimulatedMobilityAdapter:
    def __init__(self, name: str):
        if name not in PROVIDERS:
            raise ValueError("Unknown simulator provider")
        self.name = name

    def search(
        self, journey_id: str, now: datetime, *, fare: int | None = None, eta: int | None = None
    ) -> dict[str, Any]:
        base_fare, base_eta = BASE_OFFERS[self.name]
        return dict(
            quote_id=f"{journey_id}_{self.name.lower()}",
            provider=self.name,
            estimated_fare_inr=fare if fare is not None else base_fare,
            pickup_eta_sec=eta if eta is not None else base_eta,
            expires_at=(now + timedelta(seconds=30)).isoformat(),
            is_simulated=True,
        )

    def select(self, quote: dict[str, Any], now: datetime) -> bool:
        return now < datetime.fromisoformat(quote["expires_at"])

    def init(self, quote: dict[str, Any], now: datetime) -> bool:
        return self.select(quote, now)

    def confirm(self, quote: dict[str, Any], now: datetime) -> bool:
        return self.init(quote, now)

    def cancel(self, ride: dict[str, Any]) -> str:
        return "CONFIRMED"

    def status(self, ride: dict[str, Any]) -> dict[str, Any]:
        return {"state": ride["state"], "ride_id": ride["ride_id"]}

    def track(self, ride: dict[str, Any]) -> dict[str, Any]:
        return {"distance_to_pickup_m": ride["distance_to_pickup_m"], "eta_sec": ride["eta_sec"]}


ADAPTERS = {name: SimulatedMobilityAdapter(name) for name in PROVIDERS}
