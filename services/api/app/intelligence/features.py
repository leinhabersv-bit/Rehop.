"""Compute risk inputs from observed pickup telemetry and an explicit clock."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from math import asin, cos, radians, sin, sqrt

from app.intelligence.history import TelemetryHistory
from app.schemas.domain import Ride, TelemetrySample
from app.schemas.enums import GpsQuality


@dataclass(frozen=True)
class RideFeatures:
    distance_to_pickup_m: int
    net_progress_m_60s: int
    net_progress_m_120s: int
    net_progress_m_180s: int
    stationary_duration_s: float
    eta_delta_s_120s: int
    gps_age_s: float
    gps_quality: GpsQuality
    samples_in_window: int
    route_progress_ratio: float
    elapsed_since_accept_s: float
    seconds_until_need_by: float
    span_60s: float
    span_120s: float
    span_180s: float
    eta_sec: int = 0


def _displacement_m(first: TelemetrySample, second: TelemetrySample) -> float:
    if (
        first.lat is not None
        and first.lng is not None
        and second.lat is not None
        and second.lng is not None
        and abs(first.lat) <= 90
        and abs(second.lat) <= 90
        and abs(first.lng) <= 180
        and abs(second.lng) <= 180
    ):
        lat1, lat2 = radians(first.lat), radians(second.lat)
        dlat, dlng = lat2 - lat1, radians(second.lng - first.lng)
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
        return 2 * 6_371_000 * asin(sqrt(min(1.0, max(0.0, a))))
    return abs(second.distance_to_pickup_m - first.distance_to_pickup_m)


def _stationary_duration(samples: list[TelemetrySample]) -> float:
    duration = 0.0
    for earlier, later in zip(reversed(samples[:-1]), reversed(samples[1:]), strict=True):
        elapsed = (later.observed_at - earlier.observed_at).total_seconds()
        if (
            earlier.gps_quality != GpsQuality.GOOD
            or later.gps_quality != GpsQuality.GOOD
            or _displacement_m(earlier, later) >= elapsed
        ):
            break
        duration += elapsed
    return duration


def compute_features(
    history: Sequence[TelemetrySample], ride: Ride, now: datetime, need_by: datetime
) -> RideFeatures:
    """Use observation pairs inside each window without filling missing time.

    Duplicate timestamps use the last observation. A stale observation can
    still supply the current distance, but time after it never adds to a span.
    """
    by_time = {
        sample.observed_at: sample
        for sample in history
        if sample.ride_id == ride.ride_id and ride.booked_at <= sample.observed_at <= now
    }
    samples = [by_time[at] for at in sorted(by_time)]
    latest = samples[-1] if samples else None
    distance = latest.distance_to_pickup_m if latest else ride.distance_to_pickup_m
    observed_at = latest.observed_at if latest else ride.last_position_at
    quality = latest.gps_quality if latest else ride.gps_quality
    if ride.last_position_at >= observed_at and ride.gps_quality != GpsQuality.GOOD:
        quality = ride.gps_quality

    windows = {seconds: [] for seconds in (60, 120, 180)}
    for sample in samples:
        age = (now - sample.observed_at).total_seconds()
        for seconds, window in windows.items():
            if age <= seconds:
                window.append(sample)

    def progress(seconds: int) -> tuple[int, float]:
        window = windows[seconds]
        if len(window) < 2:
            return 0, 0.0
        first, last = window[0], window[-1]
        return (
            first.distance_to_pickup_m - last.distance_to_pickup_m,
            (last.observed_at - first.observed_at).total_seconds(),
        )

    progress_60, span_60 = progress(60)
    progress_120, span_120 = progress(120)
    progress_180, span_180 = progress(180)
    window_120 = windows[120]
    eta_delta = window_120[-1].eta_sec - window_120[0].eta_sec if window_120 else 0

    initial = history.initial_distance_m if isinstance(history, TelemetryHistory) else None
    if initial is None:
        initial = samples[0].distance_to_pickup_m if samples else distance
    ratio = min(1.0, max(0.0, (initial - distance) / initial)) if initial > 0 else 0.0

    return RideFeatures(
        distance_to_pickup_m=distance,
        net_progress_m_60s=progress_60,
        net_progress_m_120s=progress_120,
        net_progress_m_180s=progress_180,
        stationary_duration_s=_stationary_duration(samples),
        eta_delta_s_120s=eta_delta,
        gps_age_s=max(0.0, (now - observed_at).total_seconds()),
        gps_quality=quality,
        samples_in_window=len(windows[180]),
        route_progress_ratio=ratio,
        elapsed_since_accept_s=max(0.0, (now - ride.booked_at).total_seconds()),
        seconds_until_need_by=(need_by - now).total_seconds(),
        span_60s=span_60,
        span_120s=span_120,
        span_180s=span_180,
        eta_sec=latest.eta_sec if latest else ride.eta_sec,
    )
