# Simulated paired benchmark

Fictional providers and simulated riders. No real-world performance claim.

## Simulated held-out headline

| Simulated strategy | Pickup success (95% CI) | Deadline met (95% CI) |
|---|---|---|
| B0 | 70.0% (64.4%–75.2%) | 34.8% (28.8%–40.8%) |
| B1 | 68.4% (62.4%–74.0%) | 36.0% (30.4%–42.0%) |
| B2 | 72.4% (66.8%–78.0%) | 38.4% (32.0%–44.0%) |

## Simulated detailed metrics

| Simulated metric | B0 | B1 | B2 |
|---|---|---|---|
| pickup_success_rate | 0.7 | 0.684 | 0.724 |
| deadline_met_rate | 0.348 | 0.36 | 0.384 |
| median_time_to_pickup_sec | 565.0 | 550.0 | 530.0 |
| p90_time_to_pickup_sec | 1100.0 | 1015.0 | 1085.0 |
| median_time_from_cancel_to_new_booking_sec | 180.0 | 0.0 | 0.0 |
| p90_time_from_cancel_to_new_booking_sec | 180.0 | 0.0 | 0.0 |
| false_warning_rate | 0.012987012987012988 | 0.025974025974025976 | 0 |
| unnecessary_switch_rate | 0 | 0 | 0.012987012987012988 |
| mean_extra_fare_inr | -5.432 | -24.348 | 4.308 |
| mean_fee_upper_bound_inr | 0 | 9.668 | 12.232 |
| duplicate_active_booking_count | 0 | 0 | 0 |
| over_cap_booking_count | 0 | 0 | 0 |
| post_stop_action_count | 0 | 0 | 0 |

## Simulated paired differences and 95% intervals

```json
{
  "B0": {
    "pickup_success_rate": {
      "difference": 0.024,
      "ci95": [
        -0.004,
        0.056
      ]
    },
    "deadline_met_rate": {
      "difference": 0.036,
      "ci95": [
        0.016,
        0.064
      ]
    }
  },
  "B1": {
    "pickup_success_rate": {
      "difference": 0.04,
      "ci95": [
        0.004,
        0.08
      ]
    },
    "deadline_met_rate": {
      "difference": 0.024,
      "ci95": [
        0.004,
        0.048
      ]
    }
  }
}
```

## Simulated risk quality

| Simulated strategy | assessments | precision_high | recall_high | auroc |
|---|---|---|---|---|
| B1 | 36851 | 0.9841441929800786 | 0.2703145356411688 | 0.654336722817118 |
| B2 | 36421 | 0.9970588235294118 | 0.2735656918879453 | 0.7680448237391195 |

## Simulated assumptions

- **provider_profiles** {"PROVIDER_A": {"base_fare_inr": 154, "fare_per_km_inr": 10.8, "base_pickup_eta_sec": 367, "quote_ttl_sec": 30, "p_confirm_fail": 0.035, "p_confirm_unknown": 0.025, "p_cancel_unknown": 0.035, "driver_cancel_hazard_per_min": 0.013341057430248169, "stall_hazard_per_min": 0.046029131592284944, "mean_stall_sec": 35, "detour_hazard_per_min": 0.01685768250525221, "gps_dropout_hazard_per_min": 0.013341057430248169, "speed_mps_range": [4.5, 7.5]}, "PROVIDER_B": {"base_fare_inr": 126, "fare_per_km_inr": 9.0, "base_pickup_eta_sec": 326, "quote_ttl_sec": 35, "p_confirm_fail": 0.055, "p_confirm_unknown": 0.02, "p_cancel_unknown": 0.025, "driver_cancel_hazard_per_min": 0.011250073403288631, "stall_hazard_per_min": 0.02954889627232271, "mean_stall_sec": 20, "detour_hazard_per_min": 0.01516029253437292, "gps_dropout_hazard_per_min": 0.011250073403288631, "speed_mps_range": [5.0, 8.5]}, "PROVIDER_C": {"base_fare_inr": 117, "fare_per_km_inr": 8.0, "base_pickup_eta_sec": 440, "quote_ttl_sec": 25, "p_confirm_fail": 0.095, "p_confirm_unknown": 0.055, "p_cancel_unknown": 0.065, "driver_cancel_hazard_per_min": 0.028350134103405467, "stall_hazard_per_min": 0.06154041658463632, "mean_stall_sec": 45, "detour_hazard_per_min": 0.023216989928253558, "gps_dropout_hazard_per_min": 0.01826191021569784, "speed_mps_range": [3.5, 6.5]}, "PROVIDER_D": {"base_fare_inr": 200, "fare_per_km_inr": 12.5, "base_pickup_eta_sec": 383, "quote_ttl_sec": 45, "p_confirm_fail": 0.01, "p_confirm_unknown": 0.008, "p_cancel_unknown": 0.012, "driver_cancel_hazard_per_min": 0.004686031920724392, "stall_hazard_per_min": 0.016209310101204046, "mean_stall_sec": 15, "detour_hazard_per_min": 0.00789127605962316, "gps_dropout_hazard_per_min": 0.00628030684927002, "speed_mps_range": [4.5, 7.0]}}
- **risk_config** {"gps_age_limit_s": 30, "min_samples": 3, "full_confidence_samples": 25, "confidence_floor": 0.0, "confidence_ceiling": 1.0, "confidence_sample_base": 0.3, "confidence_sample_gain": 0.7, "confidence_age_penalty": 0.3, "unknown_confidence_cap": 0.3, "low_progress_min_span_s": 40, "low_progress_distance_m": 300, "low_progress_m": 60, "low_progress_points": 20, "stationary_grace_s": 45, "stationary_points_per_s": 0.6666666666666666, "stationary_max_points": 40, "eta_rise_threshold_s": 0, "eta_rise_points_per_s": 0.16666666666666666, "eta_rise_max_points": 20, "away_progress_threshold_m": 0, "away_points_per_m": 0.125, "away_max_points": 25, "deadline_points_per_s": 0.03333333333333333, "deadline_max_points": 3, "chat_cancel_points": 20, "near_pickup_m": 150, "near_pickup_stationary_limit_s": 180, "fresh_accept_s": 60, "min_score": 0, "max_score": 100, "medium_cutoff": 40, "high_cutoff": 70, "lower_assessments_to_drop": 2}
- **decision_config** {"lateness_points_per_second": 2, "low_risk_points": 0, "unknown_risk_points": 0, "medium_risk_points": 40, "high_risk_points": 90, "chat_cancel_points": 20, "fare_points_per_inr": 1, "switch_overhead_seconds": 15, "minimum_improvement_margin": 30, "rejection_cooldown_seconds": 120, "provider_cooldown_seconds": 120, "cancellation_fee_rate": 0.1, "cancellation_fee_cap_inr": 100, "backup_eta_weight": 0.8, "backup_fare_weight": 0.17, "backup_simulator_prior_weight": 0.03}
- **original_provider** "PROVIDER_A"
- **backup_distance** "Same sampled per-trip distance for every replacement."
- **simple_rule_stationary_threshold_sec** 120
- **label_lookahead_sec** 300
- **shadow_horizon_sec** 2100
- **manual_rebook_delay_sec** 180
- **observation_horizon_sec** 1800
- **distance_m** [800, 4000]
- **deadlines_min** {"tight": 5, "normal": 10, "relaxed": 15}
- **families** {"healthy": {"driver_cancel_hazard_per_min": 0, "stall_hazard_per_min": 0, "detour_hazard_per_min": 0, "gps_dropout_hazard_per_min": 0}, "temporary_stop": {"stall_hazard_per_min": 0.5, "mean_stall_sec": 30}, "stall": {"stall_hazard_per_min": 0.8, "mean_stall_sec": 900}, "cancel_prone": {"driver_cancel_hazard_per_min": 0.2}, "stale_gps": {"gps_dropout_hazard_per_min": 0.6, "mean_stall_sec": 90}}
- **family_allocation** "Equal 20% shares by seed modulo 5; subsets can differ by one trip."
- **deadline_allocation** "Uniform seeded choice among tight, normal, relaxed."
- **profile_scope** "Family overrides apply to all providers in a trip; remaining fictional profile values unchanged."
- **tick_sec** 5
- **max_fare_inr** 650
- **max_attempts** 2
- **max_fee_inr** 100
- **bootstrap_resamples** 1000
- **bootstrap** "Paired trip resampling, percentile 95% interval."
- **risk_label** "Per assessment, failure means that ride does not arrive within the next 300 simulated seconds, including cancellation."
- **risk_weighting** "Assessment weighted; within-trip observations are correlated. B1 and B2 observe strategy-dependent ride populations; this is not an independent common-trace classifier test."
- **counterfactual** "Original driver continued with independent persisted per-ride draws through arrival/cancellation/horizon."
- **false_warning_denominator** "Trips where counterfactual original arrives by deadline."
- **unnecessary_switch_denominator** "Trips where counterfactual original arrives by deadline."
- **time_metrics** "Successful pickups and completed cancellation-to-rebooking intervals only; uncompleted intervals censored."
- **fees** "Illustrative cancellation-fee upper bounds, never actual charges."
- **fare** "Final confirmed fare minus initially offered fare; negative differences retained."
- **initial_failure** "All strategies receive same initial provider draws; failed initial booking is a failed pickup."
- **B0** "Wait; after confirmed driver cancellation approve manual rebook after configured delay; same fare and attempt caps."
- **B1** "Rules-v1 risk; stationary >120s requests cheapest eligible backup; immediate rebook after cancellation."
- **B2** "DefaultIntelligence rules-v2 and policy; simulated rider approves all proposals."
- **approval_latency_sec** 0
- **timeout** "Unfinished trips at horizon count as failed pickup."
- **tuning** "First split fraction of consecutive seeds, held out remainder; no automatic parameter tuning."

## Simulated honesty cases

```json
[
  {
    "seed": 2357,
    "family": "stall",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "MONITORING",
    "B0_pickup_sec": 790.0,
    "B2_pickup_sec": null,
    "reason": "Simulated rescue lost pickup"
  },
  {
    "seed": 2404,
    "family": "stale_gps",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "MONITORING",
    "B0_pickup_sec": 1025.0,
    "B2_pickup_sec": null,
    "reason": "Simulated rescue lost pickup"
  },
  {
    "seed": 2278,
    "family": "cancel_prone",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "EXHAUSTED",
    "B0_pickup_sec": 1065.0,
    "B2_pickup_sec": null,
    "reason": "Simulated rescue lost pickup"
  },
  {
    "seed": 2377,
    "family": "stall",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "MONITORING",
    "B0_pickup_sec": 1145.0,
    "B2_pickup_sec": null,
    "reason": "Simulated rescue lost pickup"
  },
  {
    "seed": 2412,
    "family": "stall",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "EXHAUSTED",
    "B0_pickup_sec": 1600.0,
    "B2_pickup_sec": null,
    "reason": "Simulated rescue lost pickup"
  },
  {
    "seed": 2296,
    "family": "temporary_stop",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "PICKUP_CONFIRMED",
    "B0_pickup_sec": 995.0,
    "B2_pickup_sec": 1650.0,
    "reason": "Simulated rescue added pickup delay"
  },
  {
    "seed": 2356,
    "family": "temporary_stop",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "PICKUP_CONFIRMED",
    "B0_pickup_sec": 1195.0,
    "B2_pickup_sec": 1655.0,
    "reason": "Simulated rescue added pickup delay"
  },
  {
    "seed": 2446,
    "family": "temporary_stop",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "PICKUP_CONFIRMED",
    "B0_pickup_sec": 1045.0,
    "B2_pickup_sec": 1480.0,
    "reason": "Simulated rescue added pickup delay"
  },
  {
    "seed": 2376,
    "family": "temporary_stop",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "PICKUP_CONFIRMED",
    "B0_pickup_sec": 705.0,
    "B2_pickup_sec": 1135.0,
    "reason": "Simulated rescue added pickup delay"
  },
  {
    "seed": 2311,
    "family": "temporary_stop",
    "B0_state": "PICKUP_CONFIRMED",
    "B2_state": "PICKUP_CONFIRMED",
    "B0_pickup_sec": 1225.0,
    "B2_pickup_sec": 1550.0,
    "reason": "Simulated rescue added pickup delay"
  }
]
```

Simulated runtime 68.12 s including charts.
