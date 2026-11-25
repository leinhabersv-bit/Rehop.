"""Serializable driver motion in the fictional pickup world."""

from datetime import datetime
from enum import Enum
from math import cos, exp, radians
from random import Random

from pydantic import BaseModel, Field

from app.schemas.domain import TelemetrySample
from app.schemas.enums import GpsQuality
from app.schemas.requests import Location
from app.simulation.profiles import ProviderProfile


class MotionMode(str, Enum):  # noqa: UP042
    MOVING = "MOVING"
    STOPPED = "STOPPED"
    STALLED = "STALLED"
    DETOUR = "DETOUR"
    GPS_LOST = "GPS_LOST"


class DriverSim(BaseModel):
    ride_id: str
    route: list[tuple[float, float]]
    initial_distance_m: float
    remaining_distance_m: float
    current_speed_mps: float
    traffic_multiplier: float = 1
    mode: MotionMode = MotionMode.MOVING
    mode_ticks_remaining: int | None = None
    cancelled: bool = False
    sampled: bool = True
    history: list[TelemetrySample] = Field(default_factory=list)

    @classmethod
    def create(
        cls,
        ride_id: str,
        pickup: Location,
        profile: ProviderProfile,
        rng: Random,
        *,
        distance_m: float | None = None,
        speed_mps: float | None = None,
        sampled: bool = True,
    ):
        speed = speed_mps if speed_mps is not None else rng.uniform(*profile.speed_mps_range)
        distance = (
            distance_m
            if distance_m is not None
            else (profile.base_pickup_eta_sec * sum(profile.speed_mps_range) / 2 * rng.uniform(0.95, 1.05))
        )
        longitude_offset = distance / (111_320 * cos(radians(pickup.lat)))
        route = [(pickup.lat, pickup.lng + longitude_offset * (1 - index / 19)) for index in range(20)]
        return cls(
            ride_id=ride_id,
            route=route,
            initial_distance_m=distance,
            remaining_distance_m=distance,
            current_speed_mps=speed,
            sampled=sampled,
        )

    def force_mode(self, mode: MotionMode, duration_ticks: int | None = None) -> None:
        self.mode = mode
        self.mode_ticks_remaining = duration_ticks

    def tick(self, now: datetime, profile: ProviderProfile, rng: Random) -> TelemetrySample | None:
        if self.cancelled:
            return None
        if self.sampled and rng.random() < 1 - exp(-profile.driver_cancel_hazard_per_min / 12):
            self.cancelled = True
            return None
        if self.mode_ticks_remaining == 0:
            self.force_mode(MotionMode.MOVING)
        if self.sampled and self.mode == MotionMode.MOVING:
            hazards = (
                (MotionMode.STOPPED, profile.stall_hazard_per_min),
                (MotionMode.DETOUR, profile.detour_hazard_per_min),
                (MotionMode.GPS_LOST, profile.gps_dropout_hazard_per_min),
            )
            for mode, rate in hazards:
                if rng.random() < 1 - exp(-rate / 12):
                    duration = max(1, round(rng.expovariate(1 / profile.mean_stall_sec) / 5))
                    self.force_mode(mode, duration)
                    break
        if self.mode_ticks_remaining is not None:
            self.mode_ticks_remaining -= 1
        if self.mode == MotionMode.GPS_LOST:
            return None
        if self.mode == MotionMode.MOVING:
            self.remaining_distance_m = max(0, self.remaining_distance_m - self.current_speed_mps * 5)
            self.traffic_multiplier = 1
        elif self.mode == MotionMode.DETOUR:
            self.remaining_distance_m += self.current_speed_mps * 5
        else:
            # Waiting accumulates an explicit traffic penalty while physical position is fixed.
            self.traffic_multiplier += 15 * self.current_speed_mps / max(1, self.remaining_distance_m)
        fraction = self.remaining_distance_m / max(1, self.initial_distance_m)
        start, pickup = self.route[0], self.route[-1]
        sample = TelemetrySample(
            ride_id=self.ride_id,
            observed_at=now,
            distance_to_pickup_m=round(self.remaining_distance_m),
            eta_sec=round(self.remaining_distance_m / self.current_speed_mps * self.traffic_multiplier),
            lat=pickup[0] + (start[0] - pickup[0]) * fraction,
            lng=pickup[1] + (start[1] - pickup[1]) * fraction,
            gps_quality=GpsQuality.GOOD,
        )
        self.history.append(sample)
        return sample
