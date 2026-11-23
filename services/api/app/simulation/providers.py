"""Neutral ONDC/Beckn-shaped SIMULATOR adapters; NOT an ONDC network client.

Real protocol supports async search/on_search, select/on_select, init/on_init,
confirm/on_confirm, cancel/on_cancel, status/on_status, track/on_track.
Production would require registry onboarding, signatures, protocol validation,
network participants, payments and callback handling.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel

from app.schemas.domain import OperationResult, Quote, Ride
from app.schemas.enums import OpStatus, Provider, RideState

PROVIDERS = (Provider.PROVIDER_A, Provider.PROVIDER_B, Provider.PROVIDER_C, Provider.PROVIDER_D)
BASE_OFFERS = {
    Provider.PROVIDER_A: (320, 300),
    Provider.PROVIDER_B: (285, 240),
    Provider.PROVIDER_C: (360, 360),
    Provider.PROVIDER_D: (395, 540),
}


class RideStatus(BaseModel):
    state: RideState
    ride_id: str


class RideTracking(BaseModel):
    distance_to_pickup_m: int
    eta_sec: int


class SimulatedMobilityAdapter:
    def __init__(self, name: Provider):
        if name not in PROVIDERS:
            raise ValueError("Unknown simulator provider")
        self.name = Provider(name)

    def search(
        self, journey_id: str, now: datetime, *, fare: int | None = None, eta: int | None = None
    ) -> Quote:
        base_fare, base_eta = BASE_OFFERS[self.name]
        return Quote(
            quote_id=f"{journey_id}_{self.name.lower()}",
            provider=self.name,
            estimated_fare_inr=fare if fare is not None else base_fare,
            pickup_eta_sec=eta if eta is not None else base_eta,
            expires_at=now + timedelta(seconds=30),
            is_simulated=True,
        )

    def select(self, quote: Quote, now: datetime) -> bool:
        return now < quote.expires_at

    def init(self, quote: Quote, now: datetime) -> bool:
        return self.select(quote, now)

    def confirm(self, quote: Quote, now: datetime) -> bool:
        return self.init(quote, now)

    def cancel(self, ride: Ride) -> OperationResult:
        return OperationResult(status=OpStatus.CONFIRMED)

    def status(self, ride: Ride) -> RideStatus:
        return RideStatus(state=ride.state, ride_id=ride.ride_id)

    def track(self, ride: Ride) -> RideTracking:
        return RideTracking(distance_to_pickup_m=ride.distance_to_pickup_m, eta_sec=ride.eta_sec)


ADAPTERS = {name: SimulatedMobilityAdapter(name) for name in PROVIDERS}
