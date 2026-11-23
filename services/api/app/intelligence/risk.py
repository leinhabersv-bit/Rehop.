"""FE/BE contract: risk prediction only; this module never books or cancels rides."""
from __future__ import annotations
from typing import Any

MODEL_VERSION = 'rules-v1'


def assess(*, stationary_duration_s: int, eta_delta_s: int, distance_to_pickup_m: int,
           gps_age_s: int, gps_quality: str) -> dict[str, Any]:
    if gps_age_s >= 30 or gps_quality != 'GOOD':
        return {
            'score_0_100': 0, 'band': 'UNKNOWN', 'confidence': 0.0,
            'model_version': MODEL_VERSION, 'signals': ['stale_or_low_quality_gps'],
            'explanation': 'Pickup progress cannot be verified because location updates are unreliable.',
            'is_simulated': True,
        }
    if distance_to_pickup_m <= 150:
        return {'score_0_100': 10, 'band': 'LOW', 'confidence': 0.9,
                'model_version': MODEL_VERSION, 'signals': ['driver_near_pickup'],
                'explanation': 'The simulated driver is near the pickup point.', 'is_simulated': True}
    if stationary_duration_s >= 90 and eta_delta_s >= 90:
        return {'score_0_100': 85, 'band': 'HIGH', 'confidence': 0.85,
                'model_version': MODEL_VERSION,
                'signals': ['low_net_progress_90s', 'eta_increase_90s'],
                'explanation': 'The driver has made little progress while the pickup ETA has increased.',
                'is_simulated': True}
    if stationary_duration_s >= 40 and eta_delta_s >= 30:
        return {'score_0_100': 55, 'band': 'MEDIUM', 'confidence': 0.65,
                'model_version': MODEL_VERSION, 'signals': ['short_stop', 'eta_rising'],
                'explanation': 'Pickup may be delayed; monitoring continues.', 'is_simulated': True}
    return {'score_0_100': 12, 'band': 'LOW', 'confidence': 0.9,
            'model_version': MODEL_VERSION, 'signals': ['normal_progress'],
            'explanation': 'The driver is making expected progress toward pickup.', 'is_simulated': True}
