"""FE/BE contract: risk prediction only; this module never books or cancels rides."""

from __future__ import annotations

from app.schemas.domain import RiskAssessment
from app.schemas.enums import GpsQuality, RiskBand

MODEL_VERSION = "rules-v1"


def assess(
    *,
    stationary_duration_s: int,
    eta_delta_s: int,
    distance_to_pickup_m: int,
    gps_age_s: int,
    gps_quality: GpsQuality,
) -> RiskAssessment:
    if gps_age_s >= 30 or gps_quality != GpsQuality.GOOD:
        return RiskAssessment(
            score_0_100=0,
            band=RiskBand.UNKNOWN,
            confidence=0.0,
            model_version=MODEL_VERSION,
            signals=["stale_or_low_quality_gps"],
            explanation="Pickup progress cannot be verified because location updates are unreliable.",
            is_simulated=True,
        )
    if distance_to_pickup_m <= 150:
        return RiskAssessment(
            score_0_100=10,
            band=RiskBand.LOW,
            confidence=0.9,
            model_version=MODEL_VERSION,
            signals=["driver_near_pickup"],
            explanation="The simulated driver is near the pickup point.",
            is_simulated=True,
        )
    if stationary_duration_s >= 90 and eta_delta_s >= 90:
        return RiskAssessment(
            score_0_100=85,
            band=RiskBand.HIGH,
            confidence=0.85,
            model_version=MODEL_VERSION,
            signals=["low_net_progress_90s", "eta_increase_90s"],
            explanation="The driver has made little progress while the pickup ETA has increased.",
            is_simulated=True,
        )
    if stationary_duration_s >= 40 and eta_delta_s >= 30:
        return RiskAssessment(
            score_0_100=55,
            band=RiskBand.MEDIUM,
            confidence=0.65,
            model_version=MODEL_VERSION,
            signals=["short_stop", "eta_rising"],
            explanation="Pickup may be delayed; monitoring continues.",
            is_simulated=True,
        )
    return RiskAssessment(
        score_0_100=12,
        band=RiskBand.LOW,
        confidence=0.9,
        model_version=MODEL_VERSION,
        signals=["normal_progress"],
        explanation="The driver is making expected progress toward pickup.",
        is_simulated=True,
    )
