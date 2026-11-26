"""Evaluate driver chat on a small hand-labelled synthetic set."""

import json
import sys
from collections import Counter
from math import ceil
from pathlib import Path
from statistics import mean
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.intelligence.llm import classify_driver_message, client  # noqa: E402
from app.schemas.enums import ChatLabel  # noqa: E402

LABELS = [label.value for label in ChatLabel]
SCOPE = "Small hand-made synthetic test set. These results do not measure real-world accuracy."


def evaluate(cases, *, offline):
    confusion = {actual: dict.fromkeys(LABELS, 0) for actual in LABELS}
    timings = []
    sources = Counter()
    eta_correct = 0
    joint_correct = 0
    for case in cases:
        start = perf_counter()
        signal = classify_driver_message(case["text"], offline=offline)
        timings.append((perf_counter() - start) * 1000)
        expected = case["expected_label"]
        predicted = signal.label.value
        confusion[expected][predicted] += 1
        sources[signal.source] += 1
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
    return {
        "accuracy": sum(confusion[label][label] for label in LABELS) / len(cases),
        "eta_exact_match": eta_correct / len(cases),
        "label_and_eta_exact_match": joint_correct / len(cases),
        "per_label": measures,
        "confusion_matrix": confusion,
        "sources": dict(sources),
        "mean_latency_ms": mean(timings),
        "p95_latency_ms": sorted(timings)[ceil(0.95 * len(timings)) - 1],
    }


def markdown(report):
    def percentage(value):
        return "—" if value is None else f"{value:.1%}"

    lines = ["# Driver chat evaluation", "", SCOPE, "", f"Cases: {report['case_count']}."]
    if "llm" not in report["runs"]:
        lines.extend(["", "LLM run omitted because no API key was configured."])

    for name, run in report["runs"].items():
        lines.extend(
            [
                "",
                f"## {name}",
                "",
                f"Label accuracy: {percentage(run['accuracy'])}. "
                f"ETA exact match: {percentage(run['eta_exact_match'])}. "
                f"Both correct: {percentage(run['label_and_eta_exact_match'])}.",
                "",
                f"Mean latency: {run['mean_latency_ms']:.3f} ms. "
                f"P95 latency: {run['p95_latency_ms']:.3f} ms. "
                "Timing includes local validation, guards, and fallback.",
                "",
                "Response sources: "
                + ", ".join(f"{key} = {value}" for key, value in run["sources"].items())
                + ".",
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
        for label, counts in run["confusion_matrix"].items():
            lines.append(f"| {label} | " + " | ".join(str(counts[key]) for key in LABELS) + " |")
    return "\n".join(lines) + "\n"


def main():
    cases = [json.loads(line) for line in (ROOT / "eval/llm_cases.jsonl").read_text().splitlines() if line]
    report = {
        "scope": SCOPE,
        "case_count": len(cases),
        "runs": {"fallback": evaluate(cases, offline=True)},
    }
    if client.has_api_key():
        report["model"] = client.model_name()
        report["runs"]["llm"] = evaluate(cases, offline=False)
    out = ROOT / "eval/results"
    out.mkdir(exist_ok=True)
    (out / "llm_eval.json").write_text(json.dumps(report, indent=2) + "\n")
    (out / "llm_eval.md").write_text(markdown(report))
    for name, run in report["runs"].items():
        print(f"{name}: {run['accuracy']:.2%} label accuracy over {len(cases)} hand-made cases.")
    print("Wrote eval/results/llm_eval.json and eval/results/llm_eval.md.")


if __name__ == "__main__":
    main()
