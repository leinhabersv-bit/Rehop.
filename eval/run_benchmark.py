"""Reproducible paired benchmark of simulated trips and simulated rider actions."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services/api"))

from app.intelligence.config import DecisionConfig, RiskConfig
from app.simulation.profiles import PROFILES

from eval.metrics import bootstrap, risk_quality, summarize
from eval.simulation import DEADLINES_MIN, FAMILIES, HORIZON_SEC, run_trip
from eval.strategies import MANUAL_REBOOK_DELAY_SEC, STRATEGIES


def benchmark(trips, seed, split, delay):
    if trips < 4 or not 0 < split < 1 or not 1 <= int(trips * split) < trips:
        raise ValueError(
            "Simulated benchmark needs at least four trips and nonempty tuning/held-out sets."
        )
    started = perf_counter()
    rows = [
        run_trip(value, strategy, delay)
        for value in range(seed, seed + trips)
        for strategy in STRATEGIES
    ]
    cutoff = seed + int(trips * split)
    sections = {}
    for name, predicate in (
        ("tuning", lambda r: r["seed"] < cutoff),
        ("held_out", lambda r: r["seed"] >= cutoff),
    ):
        groups = {
            s: [r for r in rows if r["strategy"] == s and predicate(r)]
            for s in STRATEGIES
        }
        summary = {s: summarize(group) for s, group in groups.items()}
        differences = {}
        for baseline in ("B0", "B1"):
            differences[baseline] = {}
            for metric, key in (
                ("pickup_success_rate", "success"),
                ("deadline_met_rate", "deadline_met"),
            ):
                delta = [
                    int(a[key]) - int(b[key])
                    for a, b in zip(groups["B2"], groups[baseline], strict=True)
                ]
                differences[baseline][metric] = {
                    "difference": sum(delta) / len(delta),
                    "ci95": bootstrap(delta, f"{seed}:{name}:{baseline}:{key}"),
                }
        quality = {
            s: risk_quality([o for r in groups[s] for o in r["risk_observations"]])
            for s in ("B1", "B2")
        }
        sections[name] = {
            "trips": len(groups["B0"]),
            "strategies": summary,
            "paired_differences_b2_minus": differences,
            "risk_quality": quality,
        }
    held = {
        s: [r for r in rows if r["strategy"] == s and r["seed"] >= cutoff]
        for s in ("B0", "B2")
    }
    worst = sorted(
        zip(held["B0"], held["B2"], strict=True),
        key=lambda pair: (
            int(pair[1]["success"]) - int(pair[0]["success"]),
            int(pair[1]["deadline_met"]) - int(pair[0]["deadline_met"]),
            (pair[0]["pickup_sec"] or HORIZON_SEC)
            - (pair[1]["pickup_sec"] or HORIZON_SEC),
        ),
    )[:10]
    honesty = [
        {
            "seed": a["seed"],
            "family": a["family"],
            "B0_state": a["state"],
            "B2_state": b["state"],
            "B0_pickup_sec": a["pickup_sec"],
            "B2_pickup_sec": b["pickup_sec"],
            "reason": "Simulated rescue lost pickup"
            if a["success"] and not b["success"]
            else "Simulated rescue missed deadline"
            if a["deadline_met"] and not b["deadline_met"]
            else "Simulated rescue added pickup delay"
            if (b["pickup_sec"] or HORIZON_SEC) > (a["pickup_sec"] or HORIZON_SEC)
            else "Simulated tie or improvement; fewer than ten worse trips",
        }
        for a, b in worst
    ]
    return {
        "description": "Simulated benchmark; fictional provider assumptions; no real-world performance estimate.",
        "simulated": True,
        "seed": seed,
        "trips": trips,
        "split": split,
        "assumptions": {
            "provider_profiles": {
                provider.value: asdict(profile)
                for provider, profile in PROFILES.items()
            },
            "risk_config": asdict(RiskConfig()),
            "decision_config": asdict(DecisionConfig()),
            "original_provider": "PROVIDER_A",
            "backup_distance": "Same sampled per-trip distance for every replacement.",
            "simple_rule_stationary_threshold_sec": 120,
            "label_lookahead_sec": 300,
            "shadow_horizon_sec": HORIZON_SEC + 300,
            "manual_rebook_delay_sec": delay,
            "observation_horizon_sec": HORIZON_SEC,
            "distance_m": [800, 4000],
            "deadlines_min": DEADLINES_MIN,
            "families": FAMILIES,
            "family_allocation": "Equal 20% shares by seed modulo 5; subsets can differ by one trip.",
            "deadline_allocation": "Uniform seeded choice among tight, normal, relaxed.",
            "profile_scope": "Family overrides apply to all providers in a trip; remaining fictional profile values unchanged.",
            "tick_sec": 5,
            "max_fare_inr": 650,
            "max_attempts": 2,
            "max_fee_inr": 100,
            "bootstrap_resamples": 1000,
            "bootstrap": "Paired trip resampling, percentile 95% interval.",
            "risk_label": "Per assessment, failure means that ride does not arrive within the next 300 simulated seconds, including cancellation.",
            "risk_weighting": "Assessment weighted; within-trip observations are correlated. B1 and B2 observe strategy-dependent ride populations; this is not an independent common-trace classifier test.",
            "counterfactual": "Original driver continued with independent persisted per-ride draws through arrival/cancellation/horizon.",
            "false_warning_denominator": "Trips where counterfactual original arrives by deadline.",
            "unnecessary_switch_denominator": "Trips where counterfactual original arrives by deadline.",
            "time_metrics": "Successful pickups and completed cancellation-to-rebooking intervals only; uncompleted intervals censored.",
            "fees": "Illustrative cancellation-fee upper bounds, never actual charges.",
            "fare": "Final confirmed fare minus initially offered fare; negative differences retained.",
            "initial_failure": "All strategies receive same initial provider draws; failed initial booking is a failed pickup.",
            "B0": "Wait; after confirmed driver cancellation approve manual rebook after configured delay; same fare and attempt caps.",
            "B1": "Rules-v1 risk; stationary >120s requests cheapest eligible backup; immediate rebook after cancellation.",
            "B2": "DefaultIntelligence rules-v2 and policy; simulated rider approves all proposals.",
            "approval_latency_sec": 0,
            "timeout": "Unfinished trips at horizon count as failed pickup.",
            "tuning": "First split fraction of consecutive seeds, held out remainder; no automatic parameter tuning.",
        },
        **sections,
        "honesty_worst_held_out": honesty,
        "runtime_sec": perf_counter() - started,
        "trips_detail": [
            {k: v for k, v in r.items() if k != "risk_observations"} for r in rows
        ],
    }


def write_outputs(result, directory):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    directory.mkdir(parents=True, exist_ok=True)
    held = result["held_out"]
    groups = held["strategies"]
    rows = result["trips_detail"]
    cutoff = result["seed"] + int(result["trips"] * result["split"])
    fig, ax = plt.subplots()
    rates = [groups[s]["deadline_met_rate"] for s in STRATEGIES]
    intervals = []
    success_intervals = {}
    for s in STRATEGIES:
        values = [
            int(r["deadline_met"])
            for r in rows
            if r["strategy"] == s and r["seed"] >= cutoff
        ]
        intervals.append(bootstrap(values, f"{result['seed']}:simulated-chart:{s}"))
        successes = [
            int(r["success"])
            for r in rows
            if r["strategy"] == s and r["seed"] >= cutoff
        ]
        success_intervals[s] = bootstrap(
            successes, f"{result['seed']}:simulated-success:{s}"
        )
    ax.bar(
        list(STRATEGIES),
        rates,
        yerr=[
            [r - i[0] for r, i in zip(rates, intervals)],
            [i[1] - r for r, i in zip(rates, intervals)],
        ],
        capsize=5,
    )
    ax.set(
        ylabel="Simulated deadline met rate",
        ylim=(0, 1),
        title="Simulated held-out trips · bootstrap 95% intervals",
    )
    fig.tight_layout()
    fig.savefig(directory / "simulated-deadline-rate.png")
    plt.close(fig)
    fig, ax = plt.subplots()
    for s in STRATEGIES:
        values = sorted(
            r["pickup_sec"]
            for r in rows
            if r["strategy"] == s and r["seed"] >= cutoff and r["success"]
        )
        if values:
            ax.step(
                values, [(i + 1) / len(values) for i in range(len(values))], label=s
            )
    ax.set(
        xlabel="Simulated seconds to pickup",
        ylabel="Fraction of successful simulated pickups",
        title="Simulated held-out pickup-time distribution",
    )
    ax.legend()
    fig.tight_layout()
    fig.savefig(directory / "simulated-pickup-time.png")
    plt.close(fig)
    result["held_out"]["pickup_success_ci95"] = success_intervals
    result["held_out"]["deadline_rate_ci95"] = dict(zip(STRATEGIES, intervals))
    result["runtime_sec_including_charts"] = perf_counter() - result.pop(
        "_started", perf_counter()
    )
    (directory / "benchmark.json").write_text(json.dumps(result, indent=2) + "\n")

    def table(mapping):
        names = list(next(iter(mapping.values())))
        return "\n".join(
            [
                "| Simulated strategy | " + " | ".join(names) + " |",
                "|---|" + "---|" * len(names),
            ]
            + [
                "| " + s + " | " + " | ".join(str(v) for v in values.values()) + " |"
                for s, values in mapping.items()
            ]
        )

    text = "# Simulated paired benchmark\n\nFictional providers and simulated riders. No real-world performance claim.\n\n"
    text += "## Simulated held-out headline\n\n"
    text += "| Simulated strategy | Pickup success (95% CI) | Deadline met (95% CI) |\n|---|---|---|\n"
    for index, strategy in enumerate(STRATEGIES):
        success_ci = success_intervals[strategy]
        deadline_ci = intervals[index]
        text += (
            f"| {strategy} | {groups[strategy]['pickup_success_rate']:.1%} "
            f"({success_ci[0]:.1%}–{success_ci[1]:.1%}) | "
            f"{groups[strategy]['deadline_met_rate']:.1%} ({deadline_ci[0]:.1%}–{deadline_ci[1]:.1%}) |\n"
        )
    text += "\n## Simulated detailed metrics\n\n| Simulated metric | B0 | B1 | B2 |\n|---|---|---|---|\n"
    for metric in groups["B0"]:
        text += (
            "| "
            + metric
            + " | "
            + " | ".join(str(groups[s][metric]) for s in STRATEGIES)
            + " |\n"
        )
    text += "\n"
    text += (
        "## Simulated paired differences and 95% intervals\n\n```json\n"
        + json.dumps(held["paired_differences_b2_minus"], indent=2)
        + "\n```\n\n"
    )
    text += "## Simulated risk quality\n\n" + table(held["risk_quality"]) + "\n\n"
    text += (
        "## Simulated assumptions\n\n"
        + "\n".join(
            f"- **{key}** {json.dumps(value)}"
            for key, value in result["assumptions"].items()
        )
        + "\n\n"
    )
    text += (
        "## Simulated honesty cases\n\n```json\n"
        + json.dumps(result["honesty_worst_held_out"], indent=2)
        + "\n```\n\n"
    )
    text += f"Simulated runtime {result['runtime_sec_including_charts']:.2f} s including charts.\n"
    (directory / "benchmark.md").write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trips", type=int, default=500)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--split", type=float, default=0.5)
    parser.add_argument(
        "--manual-rebook-delay-sec", type=int, default=MANUAL_REBOOK_DELAY_SEC
    )
    parser.add_argument(
        "--runs", type=int, help=argparse.SUPPRESS
    )  # Compatibility for the pre-P13 CI invocation.
    args = parser.parse_args()
    if args.manual_rebook_delay_sec < 0:
        parser.error("Simulated manual delay must be nonnegative.")
    started = perf_counter()
    result = benchmark(args.trips, args.seed, args.split, args.manual_rebook_delay_sec)
    result["_started"] = started
    write_outputs(result, ROOT / "eval/results")
    print(
        f"Simulated benchmark complete: {args.trips} paired trips, {perf_counter() - started:.2f} s."
    )
    print(json.dumps(result["held_out"], indent=2))


if __name__ == "__main__":
    main()
