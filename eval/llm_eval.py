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
CASE_FILES = {"main": "llm_cases.jsonl", "holdout": "llm_cases_holdout.jsonl"}
SCOPE = "Small hand-made synthetic test sets. These results do not measure real-world accuracy."


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
    report = {"scope": SCOPE, "datasets": {}}
    live = client.has_api_key()
    if live:
        report["model"] = client.model_name()

    for split, filename in CASE_FILES.items():
        cases = [
            json.loads(line)
            for line in (ROOT / "eval" / filename).read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        runs = {"fallback": evaluate(cases, offline=True)}
        if live:
            runs["llm"] = evaluate(cases, offline=False)
        report["datasets"][split] = {"case_count": len(cases), "runs": runs}
        for name, run in runs.items():
            print(
                f"{split} / {name}: {run['accuracy']:.2%} label accuracy over {len(cases)} hand-made cases."
            )

    out = ROOT / "eval/results"
    out.mkdir(exist_ok=True)
    (out / "llm_eval.json").write_text(json.dumps(report, indent=2) + "\n")
    (out / "llm_eval.md").write_text(markdown(report))
    print("Wrote eval/results/llm_eval.json and eval/results/llm_eval.md.")


if __name__ == "__main__":
    main()
