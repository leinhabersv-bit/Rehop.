# Simulated tuning-only diagnostics

Tuning seeds 2026–2275 only; no held-out input read or executed.

- All results are simulated under fictional profiles; RiskConfig and DecisionConfig unchanged.
- Actual policy calls are recorded separately from ticks skipped by JourneyService's risk gate.
- Counts include repeated assessments of a trip; reason categories overlap.
- Actual decision calls include approval revalidation, so REQUEST_APPROVAL return counts exceed distinct rider proposals.
- NO_ELIGIBLE_BACKUP does not identify a unique filter cause; fare, availability, cooldown and attempts can interact.
- Auto-rebook decisions after driver cancellation do not need approval; their reasons are shown separately.
- No original arrival exists for cancelled, rejected-initial-booking or observation-censored originals; slack is undefined there.
- Initial quoted ETA is profile-defined and does not vary with sampled start distance. Proposed ETA is ceil(initial distance / sampled speed), before motion, without observing future arrival.
- Proposed deadlines apply only to B0 diagnostics here. Original benchmark reports and runner defaults are untouched.
- The 30-minute pickup observation limit remains fixed and may censor pickups before a relaxed deadline.

## Simulated family breakdown

| Group | Strategy | n | Pickup success | Deadline met |
|---|---|---:|---:|---:|
| cancel_prone | B0 | 50 | 58.0% | 38.0% |
| cancel_prone | B1 | 50 | 56.0% | 44.0% |
| cancel_prone | B2 | 50 | 62.0% | 54.0% |
| healthy | B0 | 50 | 96.0% | 68.0% |
| healthy | B1 | 50 | 96.0% | 68.0% |
| healthy | B2 | 50 | 96.0% | 68.0% |
| stale_gps | B0 | 50 | 90.0% | 30.0% |
| stale_gps | B1 | 50 | 88.0% | 28.0% |
| stale_gps | B2 | 50 | 94.0% | 30.0% |
| stall | B0 | 50 | 14.0% | 4.0% |
| stall | B1 | 50 | 10.0% | 4.0% |
| stall | B2 | 50 | 24.0% | 8.0% |
| temporary_stop | B0 | 50 | 98.0% | 54.0% |
| temporary_stop | B1 | 50 | 98.0% | 50.0% |
| temporary_stop | B2 | 50 | 96.0% | 52.0% |

## Simulated deadline breakdown

| Group | Strategy | n | Pickup success | Deadline met |
|---|---|---:|---:|---:|
| normal | B0 | 93 | 74.2% | 39.8% |
| normal | B1 | 93 | 74.2% | 40.9% |
| normal | B2 | 93 | 77.4% | 45.2% |
| relaxed | B0 | 76 | 69.7% | 57.9% |
| relaxed | B1 | 76 | 65.8% | 56.6% |
| relaxed | B2 | 76 | 71.1% | 63.2% |
| tight | B0 | 81 | 69.1% | 19.8% |
| tight | B1 | 81 | 67.9% | 19.8% |
| tight | B2 | 81 | 74.1% | 19.8% |

## Failed simulated B2 trips

### stall

```json
{
  "failed_trips": 38,
  "actual_decision_calls": {
    "MONITOR": 0,
    "SEARCH_BACKUP": 7175,
    "REQUEST_APPROVAL": 132,
    "REBOOK_AFTER_CANCEL": 4,
    "STOP": 8
  },
  "non_approval_reasons_by_call": {
    "INSUFFICIENT_IMPROVEMENT": 226,
    "POLICY_RETRY_LIMIT": 6957,
    "CONFIRMED_DRIVER_CANCELLATION": 4
  },
  "requested_blocker_counts": {
    "INSUFFICIENT_IMPROVEMENT": 226,
    "REJECTION_COOLDOWN": 0,
    "NO_ELIGIBLE_BACKUP": 0,
    "POLICY_RETRY_LIMIT": 6957,
    "CANCELLATION_FEE_LIMIT": 0
  },
  "non_approval_reasons_trip_counts": {
    "INSUFFICIENT_IMPROVEMENT": 24,
    "POLICY_RETRY_LIMIT": 32,
    "CONFIRMED_DRIVER_CANCELLATION": 4
  },
  "skipped_decision_ticks": {
    "RISK_NOT_MEDIUM_OR_HIGH": 3862,
    "NO_ACTIVE_RIDE": 734
  },
  "trips_never_medium_or_high": 4,
  "trips_without_any_approval_request": 4,
  "trips_with_approval_request_but_failed": 34,
  "end_states": {
    "MONITORING": 25,
    "EXHAUSTED": 11,
    "WAITING_FOR_RIDE": 2
  }
}
```

### cancel_prone

```json
{
  "failed_trips": 19,
  "actual_decision_calls": {
    "MONITOR": 0,
    "SEARCH_BACKUP": 0,
    "REQUEST_APPROVAL": 0,
    "REBOOK_AFTER_CANCEL": 36,
    "STOP": 17
  },
  "non_approval_reasons_by_call": {
    "CONFIRMED_DRIVER_CANCELLATION": 36,
    "POLICY_RETRY_LIMIT": 17
  },
  "requested_blocker_counts": {
    "INSUFFICIENT_IMPROVEMENT": 0,
    "REJECTION_COOLDOWN": 0,
    "NO_ELIGIBLE_BACKUP": 0,
    "POLICY_RETRY_LIMIT": 17,
    "CANCELLATION_FEE_LIMIT": 0
  },
  "non_approval_reasons_trip_counts": {
    "CONFIRMED_DRIVER_CANCELLATION": 18,
    "POLICY_RETRY_LIMIT": 17
  },
  "skipped_decision_ticks": {
    "RISK_NOT_MEDIUM_OR_HIGH": 2059,
    "NO_ACTIVE_RIDE": 378
  },
  "trips_never_medium_or_high": 19,
  "trips_without_any_approval_request": 19,
  "trips_with_approval_request_but_failed": 0,
  "end_states": {
    "EXHAUSTED": 18,
    "WAITING_FOR_RIDE": 1
  }
}
```

## Simulated original-driver deadline slack

```json
{
  "overall": {
    "n": 154,
    "min": -1450.0,
    "p10": -480.0,
    "median": 80.0,
    "p90": 560.0,
    "max": 775.0,
    "negative_slack_count": 61
  },
  "family": {
    "cancel_prone": {
      "n": 18,
      "min": -195.0,
      "p10": 30.0,
      "median": 380.0,
      "p90": 655.0,
      "max": 715.0,
      "negative_slack_count": 1
    },
    "healthy": {
      "n": 48,
      "min": -300.0,
      "p10": -205.0,
      "median": 132.5,
      "p90": 630.0,
      "max": 775.0,
      "negative_slack_count": 14
    },
    "stale_gps": {
      "n": 38,
      "min": -1170.0,
      "p10": -870.0,
      "median": -165.0,
      "p90": 375.0,
      "max": 615.0,
      "negative_slack_count": 24
    },
    "stall": {
      "n": 7,
      "min": -1450.0,
      "p10": -1450.0,
      "median": -460.0,
      "p90": 575.0,
      "max": 575.0,
      "negative_slack_count": 5
    },
    "temporary_stop": {
      "n": 43,
      "min": -650.0,
      "p10": -250.0,
      "median": 80.0,
      "p90": 430.0,
      "max": 755.0,
      "negative_slack_count": 17
    }
  },
  "deadline": {
    "normal": {
      "n": 58,
      "min": -1450.0,
      "p10": -480.0,
      "median": 80.0,
      "p90": 430.0,
      "max": 460.0,
      "negative_slack_count": 22
    },
    "relaxed": {
      "n": 45,
      "min": -580.0,
      "p10": 5.0,
      "median": 480.0,
      "p90": 705.0,
      "max": 775.0,
      "negative_slack_count": 4
    },
    "tight": {
      "n": 51,
      "min": -1140.0,
      "p10": -720.0,
      "median": -110.0,
      "p90": 105.0,
      "max": 180.0,
      "negative_slack_count": 35
    }
  },
  "undefined": {
    "driver_cancelled": 63,
    "no_arrival_or_cancellation_observed": 33
  }
}
```

## Proposed simulated deadline calibration

Use the initial movement-based ETA plus 3 / 8 / 15 minutes for tight / normal / relaxed.
This differs from the profile's quoted ETA. Neither uses future realised arrival.

| Family | n | B0 pickup success | B0 deadline met |
|---|---:|---:|---:|
| cancel_prone | 50 | 58.0% | 54.0% |
| healthy | 50 | 96.0% | 96.0% |
| stale_gps | 50 | 90.0% | 48.0% |
| stall | 50 | 14.0% | 6.0% |
| temporary_stop | 50 | 98.0% | 86.0% |

The JSON includes per-failure decision timelines, overlapping reason counts, proposed slack distributions and ETA distributions.
