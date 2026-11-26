# P05 simulator refactor report

JourneyService owns journey commands, pickup ticks, switching, and recovery. Session initializes and holds journey state, exposes snapshots and events, and forwards legacy command calls. Hosted catch-up calls JourneyService and persists DriverSim with the journey.

The supplied pre-P05 baseline was **958 lines** for engine.py. Counting the parent of the first P05 commit (`b48e5de^`) with `wc -l` gives **959**. The final engine.py is **303 lines** and journey_service.py is **822 lines**.

## New and changed modules

| Module | P05 change |
|---|---|
| `eval/run_benchmark.py` | Sends booking, cancellation, approval, and ticks through JourneyService. |
| `app/intelligence/interface.py` | Defines IntelligencePort and adapts the existing intelligence and policy functions. |
| `app/main.py` | Advances in-memory rider pickups through JourneyService. |
| `app/routes/journeys.py` | Uses JourneyService for journey commands and reads scenario setup from script data. |
| `app/services/__init__.py` | Introduces the journey services package. |
| `app/services/journey_service.py` | Owns locked commands, idempotent mutation, state transitions, risk assessment, and recovery. |
| `app/simulation/durable.py` | Persists and restores DriverSim, reads tracking flags from script data, and delegates catch-up ticks. |
| `app/simulation/engine.py` | Retains Session, initial quotes, event and snapshot access, the store, and compatibility entry points. |
| `app/simulation/scenarios.py` | Defines scenario injections, provider overrides, and run defaults. |
| `app/simulation/world.py` | Models driver movement, telemetry, and sampled hazards in serializable state. |
| `tests/browser_server.py` | Creates scripted browser fixtures through JourneyService. |
| `tests/domain/test_state_machine.py` | Calls JourneyService while preserving state and transition assertions. |
| `tests/integration/test_durable_tracking.py` | Calls JourneyService in storage round-trip and pickup tracking checks. |
| `tests/intelligence/test_llm_and_deadline.py` | Calls JourneyService in journey-level chat and deadline tests. |
| `tests/scenarios/test_scenario_outcomes.py` | Captures the S01–S16 business outcomes against the original engine and stays unchanged through the refactor. |
| `tests/scenarios/test_script_dispatch.py` | Checks that renamed scenarios behave identically after a StoredSession round trip. |
| `tests/simulation/test_determinism.py` | Exercises seeded movement through JourneyService. |
| `tests/simulation/test_determinism_seeds.py` | Checks full event equality for 17 scenarios across seeds 1–20 and measures variation between RANDOM seeds. |
| `tests/simulation/test_event_replay.py` | Exercises JourneyService and checks event replay against final journey state. |
| `tests/simulation/test_providers.py` | Uses JourneyService for journey-level provider outcome and persistence tests. |
| `tests/simulation/test_tick_restore.py` | Compares 30 continuous S03 ticks against a StoredSession save and restore after each tick. |
| `tests/simulation/test_world.py` | Checks driver motion modes, telemetry, and serializable world state. |
| `tests/storage/test_idempotency.py` | Exercises JourneyService command retries and idempotency conflicts. |
| `tests/storage/test_postgres.py` | Exercises JourneyService with hosted event, payload, rollback, and legacy-record checks. |

Application and test paths in this table are relative to `services/api`. The benchmark path is relative to the repository root.

## Scenario definitions

Scripted runs use fixed base offers and deterministic movement unless the script overrides them. Tick numbers are relative to each ride. The default scenario route auto-books Provider A, has a ₹650 fare cap, and leaves automatic rebooking off.

| Scenario | Injections | Overrides and run behavior |
|---|---|---|
| S01 | None | Healthy pickup with auto-tracking. Ordinary S01 rider requests use sampled provider profiles. |
| S02 | Ride 1 stops at tick 3 for five ticks | Resumes movement when the stop ends. |
| S03 | Ride 1 stalls at tick 1 | Auto-tracking enabled. |
| S04 | Ride 1 driver cancels at tick 8 | Automatic rebooking enabled. |
| S05 | Drivers of rides 1 and 2 each cancel at tick 8 | Automatic rebooking enabled. |
| S06 | Backups unavailable during search, then ride 1 driver cancels at tick 8 | Automatic rebooking enabled, subject to finding an eligible backup. |
| S07 | Providers B–D add ₹120 to their base fares, then ride 1 driver cancels at tick 8 | Automatic rebooking enabled with a ₹330 fare cap. |
| S08 | Ride 1 loses GPS at tick 4 | No duration is set for the scripted GPS loss. |
| S09 | Ride 1 stalls at tick 1 | Starts 100 m from pickup. |
| S10 | None | Starts 900 m from pickup and forces arrival at tick 6. The test supplies the competing rider action. |
| S11 | Ride 1 stalls at tick 1 | The rider or test supplies cancellation. |
| S12 | Next confirmation returns UNKNOWN for each provider | Route auto-booking is disabled so the caller can trigger booking. |
| S13 | Ride 1 stalls at tick 1 and the driver requests rider cancellation via chat at tick 5 | Chat is classified as an advisory signal. |
| S14 | Ride 1 stalls at tick 1 and the backup disappears at quote refresh | The original ride stays active. |
| S15 | Ride 1 stalls at tick 1 and replacement confirmation fails | Models the loss of a replacement after original cancellation. |
| S16 | Ride 1 stalls at tick 1 and scenario setup sets the deadline five minutes out | The outcome test supplies its own deadlines for the urgent and relaxed comparison. |

RANDOM has no scripted injections or automatic booking. The seed sweep explicitly books a ride to exercise sampled provider and movement behavior.

## Verification

Across 340 scenario and seed combinations, separate stores produced identical serialized event lists, including IDs, timestamps, and payloads. All 20 adjacent RANDOM seed pairs, including 20 versus 1, differed after removing seed-derived journey IDs from the comparison. The focused sweep passed 341 tests in 1.47 seconds, so it runs with the default check and has no slow marker.

```sh
git grep -n "scenario ==\|scenario in" services/api/app
```

The command printed nothing and returned exit status 1. The original business-outcome tests and golden files passed without edits.

`scripts/check.sh` passed lint and formatting for all 62 Python files. Pytest reported `611 passed, 4 skipped, 1 warning in 69.74s` with 89% coverage. The warning is the existing Starlette/httpx deprecation. The four skipped tests require Postgres.

The separate run against `TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/rehop_test"` reported `4 passed in 0.68s`.

## Remaining gaps

- JourneyService is 822 lines and still combines command coordination, idempotency, and recovery rules. Session also retains compatibility methods and initial quote creation.
- Script parameters are dictionaries and several injections are dispatched at specific lifecycle points. JourneyService has no general-purpose `inject` command, and the declared `FORCE_CANCEL_RESULT` kind has no script consumer.
- The intelligence port accepts typed feature and decision inputs from the existing functions. Its risk method does not take the history, ride, and time signature in the original design.
- DriverSim supports sampling an initial distance, but the journey path passes an explicit distance. The default is 2,200 m, including for sampled journeys. The sampled stall hazard produces a timed STOPPED mode, while persistent STALLED is currently scripted.
- The seed sweep covers a bounded in-memory flow. Hosted persistence and replay are checked separately, and the RANDOM diversity test does not measure calibration.
