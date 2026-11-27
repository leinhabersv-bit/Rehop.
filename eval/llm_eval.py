"""Evaluate driver chat on a small hand-labelled synthetic set."""

import json
import sys
from argparse import ArgumentParser, ArgumentTypeError
from collections import Counter
from functools import partial
from math import ceil, isfinite
from pathlib import Path
from statistics import mean
from time import perf_counter, sleep

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.intelligence.llm import classify_driver_message, client  # noqa: E402
from app.schemas.enums import ChatLabel  # noqa: E402

LABELS = [label.value for label in ChatLabel]
CASE_FILES = {"main": "llm_cases.jsonl", "holdout": "llm_cases_holdout.jsonl"}
SCOPE = "Small hand-made synthetic test sets. These results do not measure real-world accuracy."
BACKOFF_SECONDS = (8, 16, 32)
RETRY_STATUSES = {429, 503}


class PacedRequests:
    def __init__(self, delay_seconds: float):
        self.delay_seconds = delay_seconds
        self.last_finished: float | None = None

    def post(self, retries: list[int], url: str, **kwargs) -> httpx.Response:
        for backoff in (*BACKOFF_SECONDS, None):
            if self.last_finished is not None:
                remaining = self.delay_seconds - (perf_counter() - self.last_finished)
                if remaining > 0:
                    sleep(remaining)
            try:
                response = httpx.post(url, **kwargs)
            finally:
                self.last_finished = perf_counter()
            if response.status_code not in RETRY_STATUSES or backoff is None:
                return response
            retries.append(response.status_code)
            sleep(backoff)
        raise AssertionError("Retry loop must return its last response")


def evaluate(cases, *, offline, requests: PacedRequests | None = None):
    confusion = {actual: dict.fromkeys(LABELS, 0) for actual in LABELS}
    timings = []
    sources = Counter()
    fallback_reasons = Counter()
    retry_statuses = Counter()
    case_results = []
    eta_correct = 0
    joint_correct = 0
    llm_correct = 0
    for index, case in enumerate(cases, start=1):
        retries: list[int] = []
        post = partial(requests.post, retries) if requests is not None else None
        start = perf_counter()
        with client.trace_completion(post=post) as trace:
            signal = classify_driver_message(case["text"], offline=offline)
        timings.append((perf_counter() - start) * 1000)
        expected = case["expected_label"]
        predicted = signal.label.value
        confusion[expected][predicted] += 1
        sources[signal.source] += 1
        if signal.source == "llm":
            llm_correct += expected == predicted
        else:
            fallback_reasons[trace.reason] += 1
        retry_statuses.update(f"http_{status}" for status in retries)
        case_results.append(
            {
                "case": index,
                "expected_label": expected,
                "predicted_label": predicted,
                "expected_eta_claim_min": case["expected_eta_claim_min"],
                "predicted_eta_claim_min": signal.eta_claim_min,
                "source": signal.source,
                "reason": trace.reason,
                "retry_http_statuses": retries,
            }
        )
        eta_matches = signal.eta_claim_min == case["expected_eta_claim_min"]
        eta_correct += eta_matches
        joint_correct += eta_matches and expected == predicted

    measures = {}
    for label in LABELS:
        true_positive = confusion[label][label]
        predicted_count = sum(confusion[actual][label] for actual in LABELS)
        support = sum(confusion[label].values())
        measures[label] = {
            "precision": true_positive / predicted_count if predicted_count else None,
            "recall": true_positive / support if support else None,
            "support": support,
        }
    accuracy = sum(confusion[label][label] for label in LABELS) / len(cases)
    llm_answered = sources["llm"]
    return {
        "accuracy": accuracy,
        "overall_accuracy": accuracy,
        "llm_answered": llm_answered,
        "llm_accuracy": llm_correct / llm_answered if llm_answered else None,
        "eta_exact_match": eta_correct / len(cases),
        "label_and_eta_exact_match": joint_correct / len(cases),
        "per_label": measures,
        "confusion_matrix": confusion,
        "sources": dict(sources),
        "fallback_reasons": dict(fallback_reasons),
        "failure_reasons": {
            reason: count
            for reason, count in fallback_reasons.items()
            if reason not in {"offline", "prompt_injection_guard"}
        },
        "retry_statuses": dict(retry_statuses),
        "cases": case_results,
        "mean_latency_ms": mean(timings),
        "p95_latency_ms": sorted(timings)[ceil(0.95 * len(timings)) - 1],
    }


def markdown(report):
    def percentage(value):
        return "—" if value is None else f"{value:.1%}"

    def counts(values):
        return ", ".join(f"{key} = {value}" for key, value in sorted(values.items())) or "none"

    lines = ["# Driver chat evaluation", "", SCOPE]
    if "model" not in report:
        lines.extend(["", "LLM runs omitted because no API key was configured."])

    for split, dataset in report["datasets"].items():
        lines.extend(["", f"## {split.title()} set", "", f"Cases: {dataset['case_count']}."])
        for name, run in dataset["runs"].items():
            lines.extend(
                [
                    "",
                    f"### {name}",
                    "",
                    f"Overall label accuracy: {percentage(run['overall_accuracy'])}. "
                    f"ETA exact match: {percentage(run['eta_exact_match'])}. "
                    f"Both correct: {percentage(run['label_and_eta_exact_match'])}.",
                    "",
                    f"Mean latency: {run['mean_latency_ms']:.3f} ms. "
                    f"P95 latency: {run['p95_latency_ms']:.3f} ms. "
                    "Timing includes local validation, guards, fallback, and any pacing or retry waits.",
                    "",
                    f"LLM-answered cases: {run['llm_answered']}. "
                    f"LLM-only accuracy: {percentage(run['llm_accuracy'])}.",
                    "",
                    f"Response sources: {counts(run['sources'])}.",
                    f"Fallback reasons: {counts(run['fallback_reasons'])}.",
                    f"Failure reasons: {counts(run['failure_reasons'])}.",
                    f"Retry statuses: {counts(run['retry_statuses'])}.",
                    "",
                    "| Label | Precision | Recall | Support |",
                    "|---|---:|---:|---:|",
                ]
            )
            for label, result in run["per_label"].items():
                lines.append(
                    f"| {label} | {percentage(result['precision'])} | {percentage(result['recall'])} "
                    f"| {result['support']} |"
                )
            lines.extend(
                [
                    "",
                    "Confusion matrix rows are expected labels and columns are predicted labels.",
                    "",
                    "| Expected → predicted | " + " | ".join(LABELS) + " |",
                    "|---|" + "---:|" * len(LABELS),
                ]
            )
            for label, row in run["confusion_matrix"].items():
                lines.append(f"| {label} | " + " | ".join(str(row[key]) for key in LABELS) + " |")
            lines.extend(
                [
                    "",
                    "Case numbers are the one-based rows in the selected JSONL file.",
                    "",
                    "| Case | Expected | Predicted | Source | Reason | Retried HTTP statuses |",
                    "|---:|---|---|---|---|---|",
                ]
            )
            for case in run["cases"]:
                retries = ", ".join(map(str, case["retry_http_statuses"])) or "—"
                lines.append(
                    f"| {case['case']} | {case['expected_label']} | {case['predicted_label']} | "
                    f"{case['source']} | {case['reason']} | {retries} |"
                )
    return "\n".join(lines) + "\n"


def nonnegative_seconds(value: str) -> float:
    try:
        seconds = float(value)
    except ValueError as error:
        raise ArgumentTypeError("delay must be a finite, nonnegative number of seconds") from error
    if not isfinite(seconds) or seconds < 0:
        raise ArgumentTypeError("delay must be a finite, nonnegative number of seconds")
    return seconds


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--set", choices=(*CASE_FILES, "all"), default="all", help="choose a labelled set")
    parser.add_argument(
        "--delay-seconds",
        type=nonnegative_seconds,
        default=4.0,
        help="minimum seconds between real LLM requests (default: 4)",
    )
    args = parser.parse_args(argv)
    report = {"scope": SCOPE, "datasets": {}}
    live = client.has_api_key()
    requests = PacedRequests(args.delay_seconds) if live else None
    if live:
        report["model"] = client.model_name()

    for split, filename in CASE_FILES.items():
        if args.set != "all" and split != args.set:
            continue
        cases = [
            json.loads(line)
            for line in (ROOT / "eval" / filename).read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        runs = {"fallback": evaluate(cases, offline=True)}
        if live:
            runs["llm"] = evaluate(cases, offline=False, requests=requests)
        report["datasets"][split] = {"case_count": len(cases), "runs": runs}
        for name, run in runs.items():
            print(
                f"{split} / {name}: {run['overall_accuracy']:.2%} overall label accuracy "
                f"over {len(cases)} hand-made cases."
            )

    out = ROOT / "eval/results"
    out.mkdir(exist_ok=True)
    (out / "llm_eval.json").write_text(json.dumps(report, indent=2) + "\n")
    (out / "llm_eval.md").write_text(markdown(report))
    print("Wrote eval/results/llm_eval.json and eval/results/llm_eval.md.")


if __name__ == "__main__":
    main()
