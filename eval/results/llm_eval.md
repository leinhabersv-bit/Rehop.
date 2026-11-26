# Driver chat evaluation

Small hand-made synthetic test set. These results do not measure real-world accuracy.

Cases: 68.

LLM run omitted because no API key was configured.

## fallback

Label accuracy: 89.7%. ETA exact match: 100.0%. Both correct: 89.7%.

Mean latency: 0.004 ms. P95 latency: 0.006 ms. Timing includes local validation, guards, and fallback.

Response sources: rule_fallback = 68.

| Label | Precision | Recall | Support |
|---|---:|---:|---:|
| TRAFFIC_DELAY | 100.0% | 85.7% | 14 |
| REQUEST_RIDER_CANCEL | 100.0% | 90.0% | 10 |
| ARRIVING | 100.0% | 92.9% | 14 |
| OTHER | 63.2% | 100.0% | 12 |
| UNKNOWN | 100.0% | 83.3% | 18 |

Confusion matrix rows are expected labels and columns are predicted labels.

| Expected → predicted | TRAFFIC_DELAY | REQUEST_RIDER_CANCEL | ARRIVING | OTHER | UNKNOWN |
|---|---:|---:|---:|---:|---:|
| TRAFFIC_DELAY | 12 | 0 | 0 | 2 | 0 |
| REQUEST_RIDER_CANCEL | 0 | 9 | 0 | 1 | 0 |
| ARRIVING | 0 | 0 | 13 | 1 | 0 |
| OTHER | 0 | 0 | 0 | 12 | 0 |
| UNKNOWN | 0 | 0 | 0 | 3 | 15 |
