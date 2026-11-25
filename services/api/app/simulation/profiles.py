"""Fictional simulator parameters. These invented numbers describe no real company."""

from dataclasses import dataclass
from math import log1p

from app.schemas.enums import Provider


@dataclass(frozen=True)
class ProviderProfile:
    base_fare_inr: int
    fare_per_km_inr: float
    base_pickup_eta_sec: int
    quote_ttl_sec: int
    p_confirm_fail: float
    p_confirm_unknown: float
    p_cancel_unknown: float
    driver_cancel_hazard_per_min: float
    stall_hazard_per_min: float
    mean_stall_sec: float
    detour_hazard_per_min: float
    gps_dropout_hazard_per_min: float
    speed_mps_range: tuple[float, float]


def _pickup_rate(probability: float, minutes: float) -> float:
    """Convert the probability of at least one incident to a per-minute hazard."""
    return -log1p(-probability) / minutes


# Fixed (fare in INR, pickup ETA in seconds) offers for the scripted scenarios.
BASE_OFFERS = {
    Provider.PROVIDER_A: (320, 300),
    Provider.PROVIDER_B: (285, 240),
    Provider.PROVIDER_C: (360, 360),
    Provider.PROVIDER_D: (395, 540),
}


# Base ETAs use the initial 2,200 m and the midpoint of each speed range.
# The hazard exposure windows approximate those ETAs within the 5–7 minute range.
PROFILES = {
    Provider.PROVIDER_A: ProviderProfile(
        base_fare_inr=154,
        fare_per_km_inr=10.8,
        base_pickup_eta_sec=367,
        quote_ttl_sec=30,
        p_confirm_fail=0.035,
        p_confirm_unknown=0.025,
        p_cancel_unknown=0.035,
        driver_cancel_hazard_per_min=_pickup_rate(0.08, 6.25),
        stall_hazard_per_min=_pickup_rate(0.25, 6.25),
        mean_stall_sec=35,
        detour_hazard_per_min=_pickup_rate(0.10, 6.25),
        gps_dropout_hazard_per_min=_pickup_rate(0.08, 6.25),
        speed_mps_range=(4.5, 7.5),
    ),
    Provider.PROVIDER_B: ProviderProfile(
        base_fare_inr=126,
        fare_per_km_inr=9.0,
        base_pickup_eta_sec=326,
        quote_ttl_sec=35,
        p_confirm_fail=0.055,
        p_confirm_unknown=0.020,
        p_cancel_unknown=0.025,
        driver_cancel_hazard_per_min=_pickup_rate(0.06, 5.5),
        stall_hazard_per_min=_pickup_rate(0.15, 5.5),
        mean_stall_sec=20,
        detour_hazard_per_min=_pickup_rate(0.08, 5.5),
        gps_dropout_hazard_per_min=_pickup_rate(0.06, 5.5),
        speed_mps_range=(5.0, 8.5),
    ),
    Provider.PROVIDER_C: ProviderProfile(
        base_fare_inr=117,
        fare_per_km_inr=8.0,
        base_pickup_eta_sec=440,
        quote_ttl_sec=25,
        p_confirm_fail=0.095,
        p_confirm_unknown=0.055,
        p_cancel_unknown=0.065,
        driver_cancel_hazard_per_min=_pickup_rate(0.18, 7),
        stall_hazard_per_min=_pickup_rate(0.35, 7),
        mean_stall_sec=45,
        detour_hazard_per_min=_pickup_rate(0.15, 7),
        gps_dropout_hazard_per_min=_pickup_rate(0.12, 7),
        speed_mps_range=(3.5, 6.5),
    ),
    Provider.PROVIDER_D: ProviderProfile(
        base_fare_inr=200,
        fare_per_km_inr=12.5,
        base_pickup_eta_sec=383,
        quote_ttl_sec=45,
        p_confirm_fail=0.010,
        p_confirm_unknown=0.008,
        p_cancel_unknown=0.012,
        driver_cancel_hazard_per_min=_pickup_rate(0.03, 6.5),
        stall_hazard_per_min=_pickup_rate(0.10, 6.5),
        mean_stall_sec=15,
        detour_hazard_per_min=_pickup_rate(0.05, 6.5),
        gps_dropout_hazard_per_min=_pickup_rate(0.04, 6.5),
        speed_mps_range=(4.5, 7.0),
    ),
}
