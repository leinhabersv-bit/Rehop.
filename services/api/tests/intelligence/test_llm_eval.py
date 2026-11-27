import json
import runpy
from pathlib import Path

import httpx
import pytest

from app.intelligence.llm import client

EVAL = Path(__file__).resolve().parents[4] / "eval" / "llm_eval.py"


@pytest.fixture
def evaluator():
    return runpy.run_path(str(EVAL))["evaluate"].__globals__


def test_paced_eval_retries_and_reports_answer_coverage(monkeypatch, evaluator):
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_API_BASE", "https://eval-coverage.invalid/v1")
    texts = ["Coming in 5 min.", "Traffic, 10 min.", "Traffic near the gate."]
    responses = iter(
        [
            429,
            503,
            {"label": "OTHER", "eta_claim_min": 5, "evidence": texts[0], "confidence": 0.5},
            429,
            429,
            429,
            429,
            httpx.ReadTimeout("must not be reported verbatim"),
        ]
    )

    def post(url, **kwargs):
        result = next(responses)
        if isinstance(result, Exception):
            raise result
        request = httpx.Request("POST", url)
        if isinstance(result, int):
            return httpx.Response(result, request=request)
        return httpx.Response(
            200, request=request, json={"choices": [{"message": {"content": json.dumps(result)}}]}
        )

    now = 0.0
    waits = []

    def sleep(seconds):
        nonlocal now
        waits.append(seconds)
        now += seconds

    monkeypatch.setattr(client.httpx, "post", post)
    monkeypatch.setitem(evaluator, "perf_counter", lambda: now)
    monkeypatch.setitem(evaluator, "sleep", sleep)
    cases = [
        {"text": text, "expected_label": label, "expected_eta_claim_min": eta}
        for text, label, eta in zip(
            texts, ["ARRIVING", "TRAFFIC_DELAY", "TRAFFIC_DELAY"], [5, 10, None], strict=True
        )
    ]
    run = evaluator["evaluate"](cases, offline=False, requests=evaluator["PacedRequests"](4))
    assert waits == [8, 16, 4, 8, 16, 32, 4]
    assert run["llm_answered"] == 1
    assert run["llm_accuracy"] == 0
    assert run["overall_accuracy"] == pytest.approx(2 / 3)
    assert run["failure_reasons"] == {"http_429": 1, "timeout": 1}
    assert run["retry_statuses"] == {"http_429": 4, "http_503": 1}
    assert [(item["source"], item["reason"]) for item in run["cases"]] == [
        ("llm", "llm_answer"),
        ("rule_fallback", "http_429"),
        ("rule_fallback", "timeout"),
    ]


@pytest.mark.parametrize(
    ("data", "reason"),
    [
        ({"evidence": "invented quote"}, "evidence_not_substring"),
        ({"confidence": 1.5}, "schema_error"),
    ],
)
def test_eval_distinguishes_invalid_evidence_from_other_schema_errors(monkeypatch, evaluator, data, reason):
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    text = "Coming, 5 minutes."
    base = {"label": "ARRIVING", "eta_claim_min": 5, "evidence": text, "confidence": 0.5}
    content = json.dumps(base | data)

    def post(url, **kwargs):
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"choices": [{"message": {"content": content}}]},
        )

    monkeypatch.setattr(client.httpx, "post", post)
    run = evaluator["evaluate"](
        [{"text": text, "expected_label": "ARRIVING", "expected_eta_claim_min": 5}], offline=False
    )
    assert run["failure_reasons"] == {reason: 1}
    assert run["cases"][0]["reason"] == reason
    assert (run["llm_answered"], run["llm_accuracy"]) == (0, None)
