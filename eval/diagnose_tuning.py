"""Diagnose simulated tuning seeds only; never reads the benchmark held-out report."""

import json
import math
import sys
from collections import Counter
from pathlib import Path
from statistics import mean
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services/api"))

from datetime import timedelta

from app.simulation.engine import BASE_TIME

from eval import simulation
from eval.metrics import percentile

TUNING_SEEDS = range(2026, 2276)
PROPOSED_SLACK_MIN = {"tight": 3, "normal": 8, "relaxed": 15}
BaseService = simulation.BenchmarkService


class DiagnosticService(BaseService):
    def __init__(self, seed, strategy, *, calibrated=False):
        assert seed in TUNING_SEEDS, "Only simulated tuning seeds are permitted."
        super().__init__(seed, strategy)
        self.calibrated = calibrated
        self.decisions = []
        self.skipped = Counter()
        self.ever_elevated = False
        self.initial_eta_sec = None
        self.quoted_eta_sec = None

    def _create_driver_sim(self, journey):
        driver = super()._create_driver_sim(journey)
        if journey.ride_count == 1:
            self.quoted_eta_sec = journey.ride.eta_sec
            self.initial_eta_sec = math.ceil(
                driver.initial_distance_m / driver.current_speed_mps
            )
            if self.calibrated:
                seconds = (
                    self.initial_eta_sec
                    + 60 * PROPOSED_SLACK_MIN[self.spec["deadline"]]
                )
                journey.need_by = BASE_TIME + timedelta(seconds=seconds)
        return driver

    def _decision(self, journey, candidates, features=None):
        decision = super()._decision(journey, candidates, features)
        self.decisions.append(
            {
                "at_sec": (journey.clock - BASE_TIME).total_seconds(),
                "ride_id": journey.ride.ride_id if journey.ride else None,
                "band": journey.risk.band if journey.risk else None,
                "type": decision.type,
                "reasons": decision.reasons,
                "numbers": decision.numbers,
                "candidate_count": len(candidates),
            }
        )
        return decision

    def _tick_session(self, journey, steps):
        count = len(self.decisions)
        snapshot = super()._tick_session(journey, steps)
        elevated = journey.risk is not None and journey.risk.band in {"MEDIUM", "HIGH"}
        self.ever_elevated |= elevated
        if len(self.decisions) == count:
            if journey.pending_backup:
                self.skipped["APPROVAL_ALREADY_PENDING"] += 1
            elif journey.state == "RECONCILING":
                self.skipped["RECONCILIATION_PENDING"] += 1
            elif journey.ride is None:
                self.skipped["NO_ACTIVE_RIDE"] += 1
            elif journey.ride.state == "DRIVER_ARRIVED":
                self.skipped["DRIVER_ARRIVED"] += 1
            elif not elevated:
                self.skipped["RISK_NOT_MEDIUM_OR_HIGH"] += 1
        return snapshot


def execute(seed, strategy, calibrated=False):
    services = []

    def factory(seed, strategy):
        service = DiagnosticService(seed, strategy, calibrated=calibrated)
        services.append(service)
        return service

    # Scoped replacement changes only the eval runner's service construction.
    with patch.object(simulation, "BenchmarkService", factory):
        row = simulation.run_trip(seed, strategy)
    service = services[0]
    original = next(iter(service.futures.values()), (None, None))
    deadline = (
        service.initial_eta_sec + 60 * PROPOSED_SLACK_MIN[row["deadline"]]
        if calibrated and service.initial_eta_sec is not None
        else simulation.DEADLINES_MIN[row["deadline"]] * 60
    )
    row.update(
        deadline_met=row["success"] and row["pickup_sec"] <= deadline,
        deadline_sec=deadline,
        original_arrival_sec=original[0],
        original_cancel_sec=original[1],
        initial_eta_sec=service.initial_eta_sec,
        quoted_eta_sec=service.quoted_eta_sec,
        decisions=service.decisions,
        skipped_decision_ticks=dict(service.skipped),
        ever_medium_or_high=service.ever_elevated,
    )
    row.pop("risk_observations")
    return row


def breakdown(rows, dimension):
    result = {}
    for value in sorted({row[dimension] for row in rows}):
        result[value] = {}
        for strategy in sorted({row["strategy"] for row in rows}):
            group = [
                r for r in rows if r[dimension] == value and r["strategy"] == strategy
            ]
            result[value][strategy] = {
                "n": len(group),
                "pickup_success": mean(r["success"] for r in group),
                "deadline_met": mean(r["deadline_met"] for r in group),
            }
    return result


def distribution(values):
    return {
        "n": len(values),
        "min": min(values) if values else None,
        "p10": percentile(values, 0.1),
        "median": percentile(values, 0.5),
        "p90": percentile(values, 0.9),
        "max": max(values) if values else None,
        "negative_slack_count": sum(v < 0 for v in values),
    }


def slack(rows):
    result = {
        "overall": distribution(
            [
                r["deadline_sec"] - r["original_arrival_sec"]
                for r in rows
                if r["original_arrival_sec"] is not None
            ]
        )
    }
    for dimension in ("family", "deadline"):
        result[dimension] = {
            value: distribution(
                [
                    r["deadline_sec"] - r["original_arrival_sec"]
                    for r in rows
                    if r[dimension] == value and r["original_arrival_sec"] is not None
                ]
            )
            for value in sorted({r[dimension] for r in rows})
        }
    result["undefined"] = {
        "driver_cancelled": sum(r["original_cancel_sec"] is not None for r in rows),
        "no_arrival_or_cancellation_observed": sum(
            r["original_cancel_sec"] is None and r["original_arrival_sec"] is None
            for r in rows
        ),
    }
    return result


def diagnose():
    rows = [
        execute(seed, strategy)
        for seed in TUNING_SEEDS
        for strategy in ("B0", "B1", "B2")
    ]
    failures = {}
    for family in ("stall", "cancel_prone"):
        group = [
            r
            for r in rows
            if r["strategy"] == "B2" and r["family"] == family and not r["success"]
        ]
        decisions = [d for r in group for d in r["decisions"]]
        reasons = Counter(
            reason
            for d in decisions
            if d["type"] != "REQUEST_APPROVAL"
            for reason in d["reasons"]
        )
        failures[family] = {
            "failed_trips": len(group),
            "actual_decision_calls": {
                kind: sum(d["type"] == kind for d in decisions)
                for kind in (
                    "MONITOR",
                    "SEARCH_BACKUP",
                    "REQUEST_APPROVAL",
                    "REBOOK_AFTER_CANCEL",
                    "STOP",
                )
            },
            "non_approval_reasons_by_call": dict(reasons),
            "requested_blocker_counts": {
                reason: reasons[reason]
                for reason in (
                    "INSUFFICIENT_IMPROVEMENT",
                    "REJECTION_COOLDOWN",
                    "NO_ELIGIBLE_BACKUP",
                    "POLICY_RETRY_LIMIT",
                    "CANCELLATION_FEE_LIMIT",
                )
            },
            "non_approval_reasons_trip_counts": {
                reason: sum(
                    any(
                        reason in d["reasons"] and d["type"] != "REQUEST_APPROVAL"
                        for d in r["decisions"]
                    )
                    for r in group
                )
                for reason in reasons
            },
            "skipped_decision_ticks": dict(
                sum((Counter(r["skipped_decision_ticks"]) for r in group), Counter())
            ),
            "trips_never_medium_or_high": sum(
                not r["ever_medium_or_high"] for r in group
            ),
            "trips_without_any_approval_request": sum(
                not any(d["type"] == "REQUEST_APPROVAL" for d in r["decisions"])
                for r in group
            ),
            "trips_with_approval_request_but_failed": sum(
                any(d["type"] == "REQUEST_APPROVAL" for d in r["decisions"])
                for r in group
            ),
            "end_states": dict(Counter(r["state"] for r in group)),
            "trips": group,
        }
    baseline = [r for r in rows if r["strategy"] == "B0"]
    calibrated = [execute(seed, "B0", calibrated=True) for seed in TUNING_SEEDS]
    assert all(
        (a["seed"], a["success"], a["pickup_sec"], a["original_arrival_sec"])
        == (b["seed"], b["success"], b["pickup_sec"], b["original_arrival_sec"])
        for a, b in zip(baseline, calibrated, strict=True)
    )
    return {
        "simulated": True,
        "scope": "Tuning seeds 2026–2275 only; no held-out input read or executed.",
        "notes": [
            "All results are simulated under fictional profiles; RiskConfig and DecisionConfig unchanged.",
            "Actual policy calls are recorded separately from ticks skipped by JourneyService's risk gate.",
            "Counts include repeated assessments of a trip; reason categories overlap.",
            "Actual decision calls include approval revalidation, so REQUEST_APPROVAL return counts exceed distinct rider proposals.",
            "NO_ELIGIBLE_BACKUP does not identify a unique filter cause; fare, availability, cooldown and attempts can interact.",
            "Auto-rebook decisions after driver cancellation do not need approval; their reasons are shown separately.",
            "No original arrival exists for cancelled, rejected-initial-booking or observation-censored originals; slack is undefined there.",
            "Initial quoted ETA is profile-defined and does not vary with sampled start distance. Proposed ETA is ceil(initial distance / sampled speed), before motion, without observing future arrival.",
            "Proposed deadlines apply only to B0 diagnostics here. Original benchmark reports and runner defaults are untouched.",
            "The 30-minute pickup observation limit remains fixed and may censor pickups before a relaxed deadline.",
        ],
        "by_family": breakdown(rows, "family"),
        "by_deadline": breakdown(rows, "deadline"),
        "b2_failed_diagnostics": failures,
        "old_b0_slack_sec": slack(baseline),
        "initial_eta_sec": distribution(
            [r["initial_eta_sec"] for r in baseline if r["initial_eta_sec"] is not None]
        ),
        "quoted_eta_sec": distribution(
            [r["quoted_eta_sec"] for r in baseline if r["quoted_eta_sec"] is not None]
        ),
        "proposal": {
            "initial_eta_definition": "ceil(initial distance_m / sampled driver speed_mps)",
            "additional_minutes": PROPOSED_SLACK_MIN,
            "b0_by_family": breakdown(calibrated, "family"),
            "b0_by_deadline": breakdown(calibrated, "deadline"),
            "b0_slack_sec": slack(calibrated),
        },
    }


def markdown(report):
    lines = ["# Simulated tuning-only diagnostics", "", report["scope"], ""]
    lines.extend("- " + note for note in report["notes"])
    for title, key in (
        ("Simulated family breakdown", "by_family"),
        ("Simulated deadline breakdown", "by_deadline"),
    ):
        lines += [
            "",
            "## " + title,
            "",
            "| Group | Strategy | n | Pickup success | Deadline met |",
            "|---|---|---:|---:|---:|",
        ]
        for group, strategies in report[key].items():
            for strategy, metrics in strategies.items():
                lines.append(
                    f"| {group} | {strategy} | {metrics['n']} | {metrics['pickup_success']:.1%} | {metrics['deadline_met']:.1%} |"
                )
    lines += ["", "## Failed simulated B2 trips", ""]
    for family, data in report["b2_failed_diagnostics"].items():
        lines += [
            "### " + family,
            "",
            "```json",
            json.dumps({k: v for k, v in data.items() if k != "trips"}, indent=2),
            "```",
            "",
        ]
    lines += [
        "## Simulated original-driver deadline slack",
        "",
        "```json",
        json.dumps(report["old_b0_slack_sec"], indent=2),
        "```",
        "",
        "## Proposed simulated deadline calibration",
        "",
        "Use the initial movement-based ETA plus 3 / 8 / 15 minutes for tight / normal / relaxed.",
        "This differs from the profile's quoted ETA. Neither uses future realised arrival.",
        "",
        "| Family | n | B0 pickup success | B0 deadline met |",
        "|---|---:|---:|---:|",
    ]
    for family, group in report["proposal"]["b0_by_family"].items():
        m = group["B0"]
        lines.append(
            f"| {family} | {m['n']} | {m['pickup_success']:.1%} | {m['deadline_met']:.1%} |"
        )
    lines += [
        "",
        "The JSON includes per-failure decision timelines, overlapping reason counts, proposed slack distributions and ETA distributions.",
        "",
    ]
    return "\n".join(lines)


def main():
    report = diagnose()
    out = ROOT / "eval/results"
    (out / "tuning-diagnostics.json").write_text(json.dumps(report, indent=2) + "\n")
    (out / "tuning-diagnostics.md").write_text(markdown(report))
    print(markdown(report))


if __name__ == "__main__":
    main()
