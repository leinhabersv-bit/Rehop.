"""FE/BE contract: risk prediction only; this module never books or cancels rides."""

from __future__ import annotations

from pydantic import BaseModel

from app.intelligence.config import RiskConfig
from app.intelligence.features import RideFeatures
from app.schemas.domain import ChatSignal, RiskAssessment, RiskSignalDetail
from app.schemas.enums import ChatLabel, GpsQuality, RiskBand

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


def _band(score: int, config: RiskConfig) -> RiskBand:
    if score >= config.high_cutoff:
        return RiskBand.HIGH
    if score >= config.medium_cutoff:
        return RiskBand.MEDIUM
    return RiskBand.LOW


def _scaled(excess: float, rate: float, cap: int) -> int:
    return min(cap, int(max(0, excess) * rate))


def _explain(details: list[RiskSignalDetail]) -> str:
    templates = {
        "low_net_progress": "Observed pickup progress was {value} m.",
        "stationary_duration": "The vehicle was nearly stationary for {value} seconds.",
        "eta_rising": "The pickup ETA rose by {value} seconds.",
        "moving_away": "Net progress toward pickup was {value} m.",
        "deadline_pressure": "The estimated pickup takes {value} seconds with {threshold} seconds left.",
        "chat_rider_cancel_request": "A driver message asked the rider to cancel.",
        "near_pickup_cap": "The vehicle is within {threshold} m of pickup.",
        "fresh_accept_cap": "The ride was accepted less than {threshold} seconds ago.",
        "score_cap": "The combined signals reached the score limit.",
        "hysteresis_hold": "Monitoring is continuing while the pickup risk settles.",
    }
    return (
        " ".join(
            templates[detail.code].format(value=detail.value, threshold=detail.threshold)
            for detail in details
        )
        or "The observed pickup signals indicate low risk."
    )


def assess_v2(features: RideFeatures, chat_signal: ChatSignal | None, config: RiskConfig) -> RiskAssessment:
    confidence = min(
        config.confidence_ceiling,
        max(
            config.confidence_floor,
            config.confidence_sample_base
            + config.confidence_sample_gain
            * min(features.samples_in_window / config.full_confidence_samples, config.confidence_ceiling)
            - config.confidence_age_penalty
            * min(features.gps_age_s / config.gps_age_limit_s, config.confidence_ceiling),
        ),
    )
    details: list[RiskSignalDetail] = []

    def record(code: str, value: int | float | str, threshold: int | float | str, points: int) -> None:
        details.append(RiskSignalDetail(code=code, value=value, threshold=threshold, points=points))

    gate = "stale_or_low_quality_gps"
    if features.gps_age_s >= config.gps_age_limit_s:
        record(gate, features.gps_age_s, config.gps_age_limit_s, 0)
    if features.gps_quality != GpsQuality.GOOD:
        record(gate, features.gps_quality.value, GpsQuality.GOOD.value, 0)
    if features.samples_in_window < config.min_samples:
        record(gate, features.samples_in_window, config.min_samples, 0)
    if details:
        return RiskAssessment(
            score_0_100=config.min_score,
            band=RiskBand.UNKNOWN,
            confidence=min(confidence, config.unknown_confidence_cap),
            model_version="rules-v2",
            signals=[gate],
            signal_details=details,
            explanation="There is not enough reliable location data to assess pickup progress.",
            is_simulated=True,
        )

    progress = features.net_progress_m_120s
    stationary = features.stationary_duration_s
    eta_rise = features.eta_delta_s_120s
    if (
        features.span_120s >= config.low_progress_min_span_s
        and features.distance_to_pickup_m > config.low_progress_distance_m
        and progress < config.low_progress_m
    ):
        record("low_net_progress", progress, config.low_progress_m, config.low_progress_points)
    if stationary > config.stationary_grace_s:
        points = _scaled(
            stationary - config.stationary_grace_s,
            config.stationary_points_per_s,
            config.stationary_max_points,
        )
        record("stationary_duration", stationary, config.stationary_grace_s, points)
    if eta_rise > config.eta_rise_threshold_s:
        points = _scaled(
            eta_rise - config.eta_rise_threshold_s, config.eta_rise_points_per_s, config.eta_rise_max_points
        )
        record("eta_rising", eta_rise, config.eta_rise_threshold_s, points)
    if progress < config.away_progress_threshold_m:
        points = _scaled(
            config.away_progress_threshold_m - progress, config.away_points_per_m, config.away_max_points
        )
        record("moving_away", progress, config.away_progress_threshold_m, points)
    if features.eta_sec > features.seconds_until_need_by:
        points = _scaled(
            features.eta_sec - features.seconds_until_need_by,
            config.deadline_points_per_s,
            config.deadline_max_points,
        )
        record("deadline_pressure", features.eta_sec, features.seconds_until_need_by, points)
    if chat_signal is not None and chat_signal.label == ChatLabel.REQUEST_RIDER_CANCEL:
        record(
            "chat_rider_cancel_request",
            chat_signal.label.value,
            ChatLabel.REQUEST_RIDER_CANCEL.value,
            config.chat_cancel_points,
        )

    raw_score = sum(detail.points for detail in details)
    score = max(config.min_score, min(config.max_score, raw_score))
    if raw_score != score:
        record("score_cap", raw_score, score, score - raw_score)
    if (
        features.distance_to_pickup_m <= config.near_pickup_m
        and stationary <= config.near_pickup_stationary_limit_s
    ):
        ceiling = config.medium_cutoff - 1
        record(
            "near_pickup_cap", features.distance_to_pickup_m, config.near_pickup_m, min(0, ceiling - score)
        )
        score = min(score, ceiling)
    if features.elapsed_since_accept_s < config.fresh_accept_s:
        ceiling = config.high_cutoff - 1
        record(
            "fresh_accept_cap",
            features.elapsed_since_accept_s,
            config.fresh_accept_s,
            min(0, ceiling - score),
        )
        score = min(score, ceiling)

    return RiskAssessment(
        score_0_100=score,
        band=_band(score, config),
        confidence=confidence,
        model_version="rules-v2",
        signals=[detail.code for detail in details],
        signal_details=details,
        explanation=_explain(details),
        is_simulated=True,
    )


class RiskTracker(BaseModel):
    """Remember the last reliable band and pending downgrade for one ride."""

    ride_id: str | None = None
    band: RiskBand | None = None
    lower_count: int = 0

    def update(self, ride_id: str, assessment: RiskAssessment, config: RiskConfig) -> RiskAssessment:
        if self.ride_id != ride_id:
            self.ride_id, self.band, self.lower_count = ride_id, None, 0
        if assessment.band == RiskBand.UNKNOWN:
            self.lower_count = 0
            return assessment

        ranks = (RiskBand.LOW, RiskBand.MEDIUM, RiskBand.HIGH)
        ceiling = RiskBand.HIGH
        if "near_pickup_cap" in assessment.signals:
            ceiling = RiskBand.LOW
        elif "fresh_accept_cap" in assessment.signals:
            ceiling = RiskBand.MEDIUM
        if self.band is not None and ranks.index(self.band) > ranks.index(ceiling):
            self.band = ceiling
            self.lower_count = 0

        if self.band is None or ranks.index(assessment.band) >= ranks.index(self.band):
            self.band, self.lower_count = assessment.band, 0
            return assessment

        self.lower_count += 1
        if self.lower_count >= config.lower_assessments_to_drop:
            self.band, self.lower_count = assessment.band, 0
            return assessment

        score = config.high_cutoff if self.band == RiskBand.HIGH else config.medium_cutoff
        detail = RiskSignalDetail(
            code="hysteresis_hold",
            value=self.lower_count,
            threshold=config.lower_assessments_to_drop,
            points=score - assessment.score_0_100,
        )
        details = [*(assessment.signal_details or []), detail]
        return assessment.model_copy(
            update={
                "band": self.band,
                "score_0_100": score,
                "signals": [*assessment.signals, detail.code],
                "signal_details": details,
                "explanation": _explain(details),
            }
        )
