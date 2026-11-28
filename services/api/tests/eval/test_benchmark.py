"""Verify the simulated benchmark's pairing, arithmetic and fail-closed safety checks."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from eval.metrics import assert_safe, auroc, bootstrap, summarize  # noqa: E402
from eval.simulation import run_trip  # noqa: E402


@pytest.mark.slow
@pytest.mark.parametrize("seed", range(1, 21))
def test_original_motion_is_paired_across_strategies(seed):
    rows = [run_trip(seed, strategy, keep_trace=True) for strategy in ("B0", "B1", "B2")]
    assert rows[0]["original_trace"] == rows[1]["original_trace"] == rows[2]["original_trace"]
    assert rows[0]["original_timely"] == rows[1]["original_timely"] == rows[2]["original_timely"]

    for row in rows:
        expected = {seconds: (sample, cancelled) for seconds, sample, cancelled in row["original_trace"]}
        for event in row["original_observed"]:
            from datetime import datetime

            from app.simulation.engine import BASE_TIME

            seconds = (datetime.fromisoformat(event["timestamp"]) - BASE_TIME).total_seconds()
            sample, cancelled = expected[seconds]
            if event["type"] == "DRIVER_CANCELLED":
                assert cancelled
            else:
                assert sample is not None
                for field in ("distance_to_pickup_m", "eta_sec", "gps_quality"):
                    assert event["payload"][field] == sample[field]


def five_trips():
    return [
        {
            "seed": i,
            "success": i < 4,
            "deadline_met": i < 3,
            "pickup_sec": 60 * (i + 1) if i < 4 else None,
            "cancel_delays": [180] if i == 0 else [],
            "original_timely": i < 2,
            "high": i == 0,
            "switched": i == 1,
            "extra_fare": i * 10,
            "fee_bound": i * 5,
            "duplicate_active_booking_count": 0,
            "over_cap_booking_count": 0,
            "post_stop_action_count": 0,
        }
        for i in range(5)
    ]


def test_metrics_on_five_handmade_simulated_trips():
    actual = summarize(five_trips())
    assert actual["pickup_success_rate"] == 0.8
    assert actual["deadline_met_rate"] == 0.6
    assert actual["median_time_to_pickup_sec"] == 150
    assert actual["p90_time_to_pickup_sec"] == 240
    assert actual["median_time_from_cancel_to_new_booking_sec"] == 180
    assert actual["p90_time_from_cancel_to_new_booking_sec"] == 180
    assert actual["false_warning_rate"] == 0.5
    assert actual["unnecessary_switch_rate"] == 0.5
    assert actual["mean_extra_fare_inr"] == 20
    assert actual["mean_fee_upper_bound_inr"] == 10
    assert auroc([(0, 0, False), (1, 1, False), (1, 0, False), (2, 1, True)]) == 0.875
    assert bootstrap([1, 1, 1], "simulated") == [1, 1]


@pytest.mark.parametrize(
    "counter", ["duplicate_active_booking_count", "over_cap_booking_count", "post_stop_action_count"]
)
def test_simulated_run_fails_on_any_safety_violation(counter):
    rows = five_trips()
    rows[2][counter] = 1
    with pytest.raises(AssertionError, match=counter):
        assert_safe(rows)
    with pytest.raises(AssertionError, match=counter):
        summarize(rows)


def test_manual_baseline_keeps_waiting_after_a_successful_manual_rebook():
    from dataclasses import replace

    from eval.strategies import NoRecovery

    from app.intelligence.decision import DecisionContext
    from app.schemas.enums import RideState
    from app.schemas.requests import JourneyCreate
    from app.simulation.engine import LOCATIONS, Session

    session = Session(JourneyCreate(pickup=LOCATIONS[0], dropoff=LOCATIONS[1]))
    session.book(session.quotes[0].quote_id, "initial")
    context = DecisionContext(
        journey_state=session.state,
        active_ride=session.ride,
        last_ride=session.ride.model_copy(update={"state": RideState.DRIVER_CANCELLED}),
        risk=None,
        features=None,
        chat_signal=None,
        need_by=session.need_by,
        now=session.clock,
        ranked_backups=session.quotes[1:],
        policy=session.policy,
        recovery_attempts=1,
    )
    strategy = NoRecovery()
    assert strategy.decide(context).type == "MONITOR"
    assert strategy.decide(replace(context, active_ride=None)).type == "REQUEST_APPROVAL"
