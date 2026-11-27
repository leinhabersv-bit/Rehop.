# Driver chat evaluation

Small hand-made synthetic test sets. These results do not measure real-world accuracy.

## Holdout set

Cases: 41.

### fallback

Overall label accuracy: 56.1%. ETA exact match: 82.9%. Both correct: 53.7%.

Mean latency: 0.017 ms. P95 latency: 0.026 ms. Timing includes local validation, guards, fallback, and any pacing or retry waits.

LLM-answered cases: 0. LLM-only accuracy: —.

Response sources: rule_fallback = 41.
Fallback reasons: offline = 41.
Failure reasons: none.
Retry statuses: none.

| Label | Precision | Recall | Support |
|---|---:|---:|---:|
| TRAFFIC_DELAY | 75.0% | 33.3% | 9 |
| REQUEST_RIDER_CANCEL | 100.0% | 75.0% | 8 |
| ARRIVING | 50.0% | 18.2% | 11 |
| OTHER | 35.0% | 100.0% | 7 |
| UNKNOWN | 71.4% | 83.3% | 6 |

Confusion matrix rows are expected labels and columns are predicted labels.

| Expected → predicted | TRAFFIC_DELAY | REQUEST_RIDER_CANCEL | ARRIVING | OTHER | UNKNOWN |
|---|---:|---:|---:|---:|---:|
| TRAFFIC_DELAY | 3 | 0 | 2 | 3 | 1 |
| REQUEST_RIDER_CANCEL | 0 | 6 | 0 | 2 | 0 |
| ARRIVING | 1 | 0 | 2 | 7 | 1 |
| OTHER | 0 | 0 | 0 | 7 | 0 |
| UNKNOWN | 0 | 0 | 0 | 1 | 5 |

Case numbers are the one-based rows in the selected JSONL file.

| Case | Expected | Predicted | Source | Reason | Retried HTTP statuses |
|---:|---|---|---|---|---|
| 1 | TRAFFIC_DELAY | TRAFFIC_DELAY | rule_fallback | offline | — |
| 2 | TRAFFIC_DELAY | OTHER | rule_fallback | offline | — |
| 3 | TRAFFIC_DELAY | TRAFFIC_DELAY | rule_fallback | offline | — |
| 4 | TRAFFIC_DELAY | TRAFFIC_DELAY | rule_fallback | offline | — |
| 5 | TRAFFIC_DELAY | OTHER | rule_fallback | offline | — |
| 6 | TRAFFIC_DELAY | ARRIVING | rule_fallback | offline | — |
| 7 | TRAFFIC_DELAY | OTHER | rule_fallback | offline | — |
| 8 | TRAFFIC_DELAY | ARRIVING | rule_fallback | offline | — |
| 9 | TRAFFIC_DELAY | UNKNOWN | rule_fallback | offline | — |
| 10 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 11 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 12 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 13 | REQUEST_RIDER_CANCEL | OTHER | rule_fallback | offline | — |
| 14 | REQUEST_RIDER_CANCEL | OTHER | rule_fallback | offline | — |
| 15 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 16 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 17 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | rule_fallback | offline | — |
| 18 | ARRIVING | OTHER | rule_fallback | offline | — |
| 19 | ARRIVING | OTHER | rule_fallback | offline | — |
| 20 | ARRIVING | OTHER | rule_fallback | offline | — |
| 21 | ARRIVING | OTHER | rule_fallback | offline | — |
| 22 | ARRIVING | OTHER | rule_fallback | offline | — |
| 23 | ARRIVING | ARRIVING | rule_fallback | offline | — |
| 24 | ARRIVING | OTHER | rule_fallback | offline | — |
| 25 | ARRIVING | TRAFFIC_DELAY | rule_fallback | offline | — |
| 26 | ARRIVING | UNKNOWN | rule_fallback | offline | — |
| 27 | ARRIVING | ARRIVING | rule_fallback | offline | — |
| 28 | ARRIVING | OTHER | rule_fallback | offline | — |
| 29 | OTHER | OTHER | rule_fallback | offline | — |
| 30 | OTHER | OTHER | rule_fallback | offline | — |
| 31 | OTHER | OTHER | rule_fallback | offline | — |
| 32 | OTHER | OTHER | rule_fallback | offline | — |
| 33 | OTHER | OTHER | rule_fallback | offline | — |
| 34 | OTHER | OTHER | rule_fallback | offline | — |
| 35 | OTHER | OTHER | rule_fallback | offline | — |
| 36 | UNKNOWN | UNKNOWN | rule_fallback | offline | — |
| 37 | UNKNOWN | UNKNOWN | rule_fallback | offline | — |
| 38 | UNKNOWN | UNKNOWN | rule_fallback | offline | — |
| 39 | UNKNOWN | OTHER | rule_fallback | offline | — |
| 40 | UNKNOWN | UNKNOWN | rule_fallback | offline | — |
| 41 | UNKNOWN | UNKNOWN | rule_fallback | offline | — |

### llm

Overall label accuracy: 80.5%. ETA exact match: 90.2%. Both correct: 78.0%.

Mean latency: 4457.398 ms. P95 latency: 5078.597 ms. Timing includes local validation, guards, fallback, and any pacing or retry waits.

LLM-answered cases: 39. LLM-only accuracy: 79.5%.

Response sources: llm = 39, rule_fallback = 2.
Fallback reasons: prompt_injection_guard = 2.
Failure reasons: none.
Retry statuses: none.

| Label | Precision | Recall | Support |
|---|---:|---:|---:|
| TRAFFIC_DELAY | 90.0% | 100.0% | 9 |
| REQUEST_RIDER_CANCEL | 100.0% | 100.0% | 8 |
| ARRIVING | 100.0% | 45.5% | 11 |
| OTHER | 50.0% | 85.7% | 7 |
| UNKNOWN | 83.3% | 83.3% | 6 |

Confusion matrix rows are expected labels and columns are predicted labels.

| Expected → predicted | TRAFFIC_DELAY | REQUEST_RIDER_CANCEL | ARRIVING | OTHER | UNKNOWN |
|---|---:|---:|---:|---:|---:|
| TRAFFIC_DELAY | 9 | 0 | 0 | 0 | 0 |
| REQUEST_RIDER_CANCEL | 0 | 8 | 0 | 0 | 0 |
| ARRIVING | 1 | 0 | 5 | 5 | 0 |
| OTHER | 0 | 0 | 0 | 6 | 1 |
| UNKNOWN | 0 | 0 | 0 | 1 | 5 |

Case numbers are the one-based rows in the selected JSONL file.

| Case | Expected | Predicted | Source | Reason | Retried HTTP statuses |
|---:|---|---|---|---|---|
| 1 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 2 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 3 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 4 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 5 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 6 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 7 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 8 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 9 | TRAFFIC_DELAY | TRAFFIC_DELAY | llm | llm_answer | — |
| 10 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 11 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 12 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 13 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 14 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 15 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 16 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 17 | REQUEST_RIDER_CANCEL | REQUEST_RIDER_CANCEL | llm | llm_answer | — |
| 18 | ARRIVING | ARRIVING | llm | llm_answer | — |
| 19 | ARRIVING | ARRIVING | llm | llm_answer | — |
| 20 | ARRIVING | ARRIVING | llm | llm_answer | — |
| 21 | ARRIVING | ARRIVING | llm | llm_answer | — |
| 22 | ARRIVING | OTHER | llm | llm_answer | — |
| 23 | ARRIVING | ARRIVING | llm | llm_answer | — |
| 24 | ARRIVING | OTHER | llm | llm_answer | — |
| 25 | ARRIVING | TRAFFIC_DELAY | llm | llm_answer | — |
| 26 | ARRIVING | OTHER | llm | llm_answer | — |
| 27 | ARRIVING | OTHER | llm | llm_answer | — |
| 28 | ARRIVING | OTHER | llm | llm_answer | — |
| 29 | OTHER | OTHER | llm | llm_answer | — |
| 30 | OTHER | OTHER | llm | llm_answer | — |
| 31 | OTHER | UNKNOWN | llm | llm_answer | — |
| 32 | OTHER | OTHER | llm | llm_answer | — |
| 33 | OTHER | OTHER | llm | llm_answer | — |
| 34 | OTHER | OTHER | llm | llm_answer | — |
| 35 | OTHER | OTHER | llm | llm_answer | — |
| 36 | UNKNOWN | UNKNOWN | llm | llm_answer | — |
| 37 | UNKNOWN | UNKNOWN | llm | llm_answer | — |
| 38 | UNKNOWN | UNKNOWN | llm | llm_answer | — |
| 39 | UNKNOWN | OTHER | llm | llm_answer | — |
| 40 | UNKNOWN | UNKNOWN | rule_fallback | prompt_injection_guard | — |
| 41 | UNKNOWN | UNKNOWN | rule_fallback | prompt_injection_guard | — |
