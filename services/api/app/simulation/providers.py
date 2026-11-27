"""Neutral ONDC/Beckn-shaped SIMULATOR adapters; NOT an ONDC network client.

Real protocol supports async search/on_search, select/on_select, init/on_init,
confirm/on_confirm, cancel/on_cancel, status/on_status, track/on_track.
Production would require registry onboarding, signatures, protocol validation,
network participants, payments and callback handling.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from math import exp
from random import Random

from pydantic import BaseModel, Field

from app.domain.state_machine import ACTIVE_RIDE_STATES
from app.schemas.domain import OperationResult, Quote, Ride
from app.schemas.enums import OpStatus, Provider, RideState
from app.simulation.profiles import ProviderProfile


class ProviderState(BaseModel):
    draw_index: int = 0
    confirmations: dict[str, OperationResult] = Field(default_factory=dict)
    rides: dict[str, RideState] = Field(default_factory=dict)


class ScenarioOverrides(BaseModel):
    quote_offers: dict[Provider, tuple[int, int]] = Field(default_factory=dict)
    next_confirm: dict[Provider, OpStatus] = Field(default_factory=dict)
    next_cancel: dict[Provider, OpStatus] = Field(default_factory=dict)
    reject_next_init: set[Provider] = Field(default_factory=set)
    scripted: bool = False


class ProviderRandom(Random):
    """Recreate each draw from the seed and the counter serialized in the session."""

    def __init__(self, seed: int, journey_id: str, provider: Provider, state: ProviderState):
        self.seed_prefix = f"{seed}:{journey_id}:{provider.value}"
        self.state = state
        super().__init__(self.seed_prefix)

    def random(self) -> float:
        index = self.state.draw_index
        self.state.draw_index += 1
        return Random(f"{self.seed_prefix}:{index}").random()


class RideStatus(BaseModel):
    state: RideState
    ride_id: str


class RideTracking(BaseModel):
    distance_to_pickup_m: int
    eta_sec: int


class SimulatedMobilityAdapter:
    def __init__(
        self,
        profile: ProviderProfile,
        rng: Random,
        *,
        name: Provider = Provider.PROVIDER_A,
        state: ProviderState | None = None,
        overrides: ScenarioOverrides | None = None,
    ):
        self.name = name
        self.profile = profile
        self.rng = rng
        self.state = state if state is not None else ProviderState()
        self.overrides = overrides if overrides is not None else ScenarioOverrides()

    def search(self, journey_id: str, now: datetime, distance_km: float) -> Quote:
        fixed_offer = self.overrides.quote_offers.get(self.name)
        if fixed_offer is not None:
            fare, eta = fixed_offer
            ttl = 30
        else:
            base_fare = self.profile.base_fare_inr + distance_km * self.profile.fare_per_km_inr
            fare = round(base_fare * self.rng.uniform(0.92, 1.08))
            eta = self.profile.base_pickup_eta_sec
            ttl = self.profile.quote_ttl_sec
        return Quote(
            quote_id=f"{journey_id}_{self.name.lower()}",
            provider=self.name,
            estimated_fare_inr=fare,
            pickup_eta_sec=eta,
            expires_at=now + timedelta(seconds=ttl),
            is_simulated=True,
        )

    def select(self, quote: Quote, now: datetime) -> bool:
        return quote.provider == self.name and now < quote.expires_at

    def init(self, quote: Quote, now: datetime) -> bool:
        if self.name in self.overrides.reject_next_init:
            self.overrides.reject_next_init.remove(self.name)
            return False
        return self.select(quote, now)

    def confirm(self, quote: Quote, now: datetime, ride: Ride) -> OperationResult:
        if not self.select(quote, now) or ride.provider != self.name or ride.quote_id != quote.quote_id:
            return OperationResult(status=OpStatus.FAILED, reason="Quote is expired or invalid.")
        if self.state.rides.get(ride.ride_id) in ACTIVE_RIDE_STATES:
            return OperationResult(status=OpStatus.FAILED, reason="Ride already exists.")
        override = self.overrides.next_confirm.pop(self.name, None)
        if override is not None:
            status = override
        elif self.overrides.scripted:
            status = OpStatus.CONFIRMED
        else:
            draw = self.rng.random()
            if draw < self.profile.p_confirm_fail:
                status = OpStatus.FAILED
            elif draw < self.profile.p_confirm_fail + self.profile.p_confirm_unknown:
                status = OpStatus.UNKNOWN
            else:
                status = OpStatus.CONFIRMED

        # A confirm timeout can hide either an accepted booking or a rejection.
        accepted = status == OpStatus.CONFIRMED or (
            override is None and status == OpStatus.UNKNOWN and self.rng.random() < 0.5
        )
        self.state.rides[ride.ride_id] = ride.state if accepted else RideState.FAILED
        return OperationResult(
            status=status, ride=ride.model_copy(deep=True) if status == OpStatus.CONFIRMED else None
        )

    def confirm_once(self, key: str, quote: Quote, now: datetime, ride: Ride) -> OperationResult:
        if key not in self.state.confirmations:
            self.state.confirmations[key] = self.confirm(quote, now, ride)
        return self.state.confirmations[key].model_copy(deep=True)

    def cancel(self, ride_id: str) -> OperationResult:
        state = self.state.rides.get(ride_id)
        if state == RideState.RIDER_CANCELLED:
            return OperationResult(status=OpStatus.CONFIRMED)
        if state not in {RideState.CONFIRMED, RideState.DRIVER_EN_ROUTE, RideState.DRIVER_ARRIVED}:
            return OperationResult(status=OpStatus.FAILED, reason="Ride cannot be cancelled.")
        status = self.overrides.next_cancel.pop(self.name, None)
        if status is None:
            status = OpStatus.CONFIRMED
            if not self.overrides.scripted and self.rng.random() < self.profile.p_cancel_unknown:
                status = OpStatus.UNKNOWN
        # A cancellation timeout models loss of the acknowledgement after commit.
        if status != OpStatus.FAILED:
            self.state.rides[ride_id] = RideState.RIDER_CANCELLED
        return OperationResult(status=status)

    def status(self, ride_id: str) -> RideStatus | None:
        state = self.state.rides.get(ride_id)
        return RideStatus(state=state, ride_id=ride_id) if state is not None else None

    def update_ride(self, ride: Ride) -> None:
        self.state.rides[ride.ride_id] = ride.state

    def track(self, ride: Ride) -> RideTracking:
        return RideTracking(distance_to_pickup_m=ride.distance_to_pickup_m, eta_sec=ride.eta_sec)

    def hazard(self, rate_per_min: float) -> bool:
        return self.rng.random() < 1 - exp(-rate_per_min * 5 / 60)

    def stall_ticks(self) -> int:
        seconds = self.rng.expovariate(1 / self.profile.mean_stall_sec)
        return max(1, round(seconds / 5))

    def progress_m(self) -> int:
        return round(5 * self.rng.uniform(*self.profile.speed_mps_range))
