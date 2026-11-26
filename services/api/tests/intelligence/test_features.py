from datetime import UTC, datetime, timedelta
from itertools import accumulate

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.intelligence.features import compute_features
from app.intelligence.history import TelemetryHistory
from app.schemas.domain import Ride, TelemetrySample
from app.schemas.enums import GpsQuality
from app.schemas.requests import JourneyCreate
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, SimulationStore

START = datetime(2026, 11, 25, tzinfo=UTC)
RIDE = Ride(
    ride_id="ride_1",
    journey_id="journey_1",
    provider="PROVIDER_A",
    quote_id="quote_1",
    state="DRIVER_EN_ROUTE",
    booked_at=START,
    driver_id="driver_1",
    distance_to_pickup_m=1000,
    eta_sec=200,
    last_position_at=START,
    cancellation_fee_inr=None,
    gps_quality="GOOD",
    is_simulated=True,
)


def at(seconds):
    return START + timedelta(seconds=seconds)


def observation(seconds, distance, eta=200, **kwargs):
    return TelemetrySample(
        ride_id=RIDE.ride_id,
        observed_at=at(seconds),
        distance_to_pickup_m=distance,
        eta_sec=eta,
        gps_quality=kwargs.pop("gps_quality", GpsQuality.GOOD),
        **kwargs,
    )


def test_steady_approach():
    trace = [observation(t, 1000 - t * 5, 200 - t) for t in range(0, 181, 5)]
    result = compute_features(trace, RIDE, at(180), at(300))
    assert result.distance_to_pickup_m == 100
    assert (result.net_progress_m_60s, result.net_progress_m_120s, result.net_progress_m_180s) == (
        300,
        600,
        900,
    )
    assert (result.span_60s, result.span_120s, result.span_180s) == (60, 120, 180)
    assert result.stationary_duration_s == 0
    assert result.eta_delta_s_120s == -120
    assert result.gps_age_s == 0
    assert result.gps_quality == GpsQuality.GOOD
    assert result.samples_in_window == 37
    assert result.route_progress_ratio == pytest.approx(0.9)
    assert result.elapsed_since_accept_s == 180
    assert result.seconds_until_need_by == 120


def test_red_light_then_movement_resets_stationary_duration():
    trace = [observation(t, 1000) for t in range(0, 61, 5)]
    assert compute_features(trace, RIDE, at(60), at(300)).stationary_duration_s == 60
    trace.append(observation(65, 980))
    features = compute_features(trace, RIDE, at(65), at(300))
    assert features.stationary_duration_s == 0
    assert features.net_progress_m_60s == 20


def test_full_three_minute_stall_and_eta_increase():
    trace = [observation(t, 1000, 200 + t) for t in range(0, 181, 5)]
    result = compute_features(trace, RIDE, at(180), at(300))
    assert result.stationary_duration_s == 180
    assert result.net_progress_m_180s == 0
    assert result.eta_delta_s_120s == 120


def test_detour_has_negative_progress_and_zero_route_progress():
    trace = [observation(0, 1000), observation(25, 1050, 225), observation(60, 1120, 260)]
    result = compute_features(trace, RIDE, at(60), at(300))
    assert result.net_progress_m_60s == -120
    assert result.route_progress_ratio == 0
    assert result.stationary_duration_s == 0


def test_position_speed_checks_lateral_movement_and_one_meter_per_second_boundary():
    lateral = [observation(0, 1000, lat=0, lng=0), observation(5, 1000, lat=0, lng=0.0001)]
    assert compute_features(lateral, RIDE, at(5), at(300)).stationary_duration_s == 0
    radial = [observation(0, 1000), observation(5, 995), observation(10, 991)]
    assert compute_features(radial, RIDE, at(10), at(300)).stationary_duration_s == 5


def test_gps_lost_does_not_extend_observed_windows():
    trace = [observation(25, 1000), observation(40, 980), observation(45, 980)]
    ride = RIDE.model_copy(update={"last_position_at": at(45), "gps_quality": GpsQuality.POOR})
    result = compute_features(trace, ride, at(85), at(300))
    assert result.gps_age_s == 40
    assert result.gps_quality == GpsQuality.POOR
    assert result.samples_in_window == 3
    assert result.span_60s == 20
    assert result.net_progress_m_60s == 20
    assert result.stationary_duration_s == 5


def test_recent_accept_and_past_deadline_with_partial_windows():
    trace = [observation(3, 1000, 200), observation(10, 979, 193)]
    result = compute_features(trace, RIDE, at(10), at(9))
    assert result.elapsed_since_accept_s == 10
    assert result.seconds_until_need_by == -1
    assert (result.span_60s, result.span_120s, result.span_180s) == (7, 7, 7)
    assert result.eta_delta_s_120s == -7


def test_empty_and_single_sample_windows_have_zero_spans():
    empty = compute_features([], RIDE, at(180), at(300))
    assert (empty.distance_to_pickup_m, empty.gps_age_s, empty.samples_in_window) == (1000, 180, 0)
    result = compute_features([observation(180, 950)], RIDE, at(180), at(300))
    assert (result.span_60s, result.eta_delta_s_120s, result.net_progress_m_180s) == (0, 0, 0)


@given(
    st.lists(
        st.tuples(st.integers(0, 130), st.integers(-200, 5000), st.integers(0, 2000)),
        max_size=100,
    ),
    st.integers(0, 300),
)
def test_monotone_time_traces_never_raise_and_progress_ratio_is_bounded(points, gap):
    timestamps = list(accumulate(point[0] for point in points))
    trace = [
        observation(timestamp, point[1], point[2])
        for timestamp, point in zip(timestamps, points, strict=True)
    ]
    result = compute_features(trace, RIDE, at((timestamps[-1] if timestamps else 0) + gap), at(300))
    assert 0 <= result.route_progress_ratio <= 1


def test_history_prunes_by_time_and_retains_initial_distance():
    history = TelemetryHistory(RIDE.ride_id, initial_distance_m=1000)
    for t in range(0, 651, 5):
        history.append(observation(t, 1000 - t))
    assert len(history) == 121
    assert history[0].observed_at == at(50)
    assert compute_features(history, RIDE, at(650), at(900)).route_progress_ratio == pytest.approx(0.65)
    history.prune(at(1251))
    assert not history


def test_service_history_is_bounded_and_survives_stored_session():
    journey = SimulationStore().create(
        JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]),
        scenario="S03",
        deterministic=True,
    )
    service = JourneyService()
    service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    service.tick(journey.id, 130, session=journey)
    payload = StoredSession.model_validate(vars(journey)).model_dump_json()
    restored = StoredSession.model_validate_json(payload).restore()
    assert len(restored.driver_sim.history) == 121
    assert restored.driver_sim.history == journey.driver_sim.history
    assert restored.driver_sim.history[0].observed_at == journey.clock - timedelta(minutes=10)
    for session in (journey, restored):
        service.tick(session.id, 1, session=session)
    assert restored.list_events() == journey.list_events()
    assert restored.driver_sim.history == journey.driver_sim.history
