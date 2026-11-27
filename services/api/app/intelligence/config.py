"""Fictional scoring defaults for the pickup simulator, without field calibration."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskConfig:
    # Reliability gates and confidence.
    gps_age_limit_s: float = 30
    min_samples: int = 3
    full_confidence_samples: int = 25
    confidence_floor: float = 0.0
    confidence_ceiling: float = 1.0
    confidence_sample_base: float = 0.30
    confidence_sample_gain: float = 0.70
    confidence_age_penalty: float = 0.30
    unknown_confidence_cap: float = 0.30

    # A partial window needs enough observed time to support slow progress.
    low_progress_min_span_s: float = 40
    low_progress_distance_m: int = 300
    low_progress_m: int = 60
    low_progress_points: int = 20

    # Each scale gives points per unit of excess, rounded down to whole points.
    stationary_grace_s: float = 45
    stationary_points_per_s: float = 2 / 3
    stationary_max_points: int = 40
    eta_rise_threshold_s: int = 0
    eta_rise_points_per_s: float = 1 / 6
    eta_rise_max_points: int = 20
    away_progress_threshold_m: int = 0
    away_points_per_m: float = 1 / 8
    away_max_points: int = 25
    deadline_points_per_s: float = 1 / 30
    deadline_max_points: int = 3
    chat_cancel_points: int = 20

    # Short waits near pickup and immediately after acceptance have band ceilings.
    near_pickup_m: int = 150
    near_pickup_stationary_limit_s: float = 180
    fresh_accept_s: float = 60
    min_score: int = 0
    max_score: int = 100
    medium_cutoff: int = 40
    high_cutoff: int = 70
    lower_assessments_to_drop: int = 2


@dataclass(frozen=True)
class DecisionConfig:
    # Simulated preference points, not financial losses or calibrated predictions.
    lateness_points_per_second: int = 2
    low_risk_points: int = 0
    unknown_risk_points: int = 0
    medium_risk_points: int = 40
    high_risk_points: int = 90
    chat_cancel_points: int = 20
    fare_points_per_inr: int = 1
    switch_overhead_seconds: int = 15
    minimum_improvement_margin: int = 30
    rejection_cooldown_seconds: int = 120
    provider_cooldown_seconds: int = 120

    # Illustrative cancellation-fee upper bound and normalized ranking weights.
    cancellation_fee_rate: float = 0.10
    cancellation_fee_cap_inr: int = 100
    backup_eta_weight: float = 0.80
    backup_fare_weight: float = 0.17
    backup_simulator_prior_weight: float = 0.03
