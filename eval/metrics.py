"""Metrics and uncertainty for synthetic, simulated trips only."""

from math import ceil
from random import Random
from statistics import mean, median


def percentile(values, fraction):
    values = sorted(values)
    if not values:
        return None
    if fraction == 0.5:
        return median(values)
    return values[max(0, ceil(len(values) * fraction) - 1)]


def assert_safe(rows):
    for row in rows:
        for name in (
            "duplicate_active_booking_count",
            "over_cap_booking_count",
            "post_stop_action_count",
        ):
            if row[name]:
                raise AssertionError(
                    f"Simulated safety violation: seed {row['seed']}, {name}={row[name]}"
                )


def summarize(rows):
    assert_safe(rows)
    return {
        "pickup_success_rate": mean(r["success"] for r in rows),
        "deadline_met_rate": mean(r["deadline_met"] for r in rows),
        "median_time_to_pickup_sec": percentile(
            [r["pickup_sec"] for r in rows if r["success"]], 0.5
        ),
        "p90_time_to_pickup_sec": percentile(
            [r["pickup_sec"] for r in rows if r["success"]], 0.9
        ),
        "median_time_from_cancel_to_new_booking_sec": percentile(
            [t for r in rows for t in r["cancel_delays"]], 0.5
        ),
        "p90_time_from_cancel_to_new_booking_sec": percentile(
            [t for r in rows for t in r["cancel_delays"]], 0.9
        ),
        "false_warning_rate": mean(r["high"] for r in rows if r["original_timely"])
        if any(r["original_timely"] for r in rows)
        else None,
        "unnecessary_switch_rate": mean(
            r["switched"] for r in rows if r["original_timely"]
        )
        if any(r["original_timely"] for r in rows)
        else None,
        "mean_extra_fare_inr": mean(r["extra_fare"] for r in rows),
        "mean_fee_upper_bound_inr": mean(r["fee_bound"] for r in rows),
        **{
            name: sum(r[name] for r in rows)
            for name in (
                "duplicate_active_booking_count",
                "over_cap_booking_count",
                "post_stop_action_count",
            )
        },
    }


def bootstrap(differences, seed, resamples=1000):
    rng = Random(seed)
    samples = [
        mean(rng.choices(differences, k=len(differences))) for _ in range(resamples)
    ]
    return [percentile(samples, 0.025), percentile(samples, 0.975)]


def auroc(observations):
    positives = sum(label for _, label, _ in observations)
    negatives = len(observations) - positives
    if not positives or not negatives:
        return None
    ordered = sorted(observations)
    rank_sum = 0
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][0] == ordered[index][0]:
            end += 1
        average_rank = (index + 1 + end) / 2
        rank_sum += average_rank * sum(row[1] for row in ordered[index:end])
        index = end
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def risk_quality(observations):
    tp = sum(label and high for _, label, high in observations)
    predicted = sum(high for _, _, high in observations)
    positives = sum(label for _, label, _ in observations)
    return {
        "assessments": len(observations),
        "precision_high": tp / predicted if predicted else None,
        "recall_high": tp / positives if positives else None,
        "auroc": auroc(observations),
    }
