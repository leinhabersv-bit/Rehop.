# Journey playback and live events

The web app polls the same endpoint locally and on Vercel. A hosted request loads the saved session and runs any owed ticks under the journey lock before reading it. Each tick advances simulated time by five seconds. At 20×, one tick is due every 250 ms of wall time. At most 180 ticks run per catch-up. Subsequent requests can drain time still owed.

Ordinary auto-tracked journeys start at 1× once a driver is en route. Deterministic scenario runs start paused for manual ticking. The movement clock stops when no driver is en route. Reconciling journeys perform bounded status checks while playing. A recovery proposal can remain visible while the original driver moves.

## FE2 polling flow

1. Fetch `GET /api/v1/journeys/{id}` for the snapshot. Start the event cursor at zero for a new timeline, or resume after the last **contiguous sequence already applied**. The snapshot's `last_event_seq` alone does not mean the client received those events.
2. Every **1.5 seconds**, call `GET /api/v1/journeys/{id}/events?since_seq=<cursor>`. Keep at most one poll in flight. If you have an `ETag` from a response for this same journey and cursor, send its value as `If-None-Match`. Treat each ETag as opaque.
3. On **200**, merge events by `seq` and apply them in order. Deduplicate overlaps and leave the cursor at the last contiguous event if there is a gap. Save the response ETag for the cursor you requested. Refetch the journey snapshot when new events arrive and the displayed snapshot is behind.
4. On **304**, the stream for that cursor is unchanged. There is no JSON body. Keep your events and cursor, and continue polling. On a transport error, retry from the same cursor.
5. `POST /api/v1/journeys/{id}/play` with `{"speed": 1}` to play or change speed. Valid speeds are 1, 2, 5, 10, and 20. `POST /api/v1/journeys/{id}/pause` has no request body. Both return `{"playing": true|false, "speed": <speed>}`. Pause settles work due at the old speed up to the catch-up limit and drops the remaining clock debt. Resume starts a fresh interval. Keep polling after pause to pick up user actions.

Keep playback controls separate from the event cursor. Play and pause return their state directly and do not add timeline events. `/tick` remains a local development tool for explicit steps.

## Optional WebSocket

Connect to `/ws/journeys/{id}?since_seq=<cursor>` with `ws:` or `wss:` as appropriate. Each iteration catches up and sends individual journey events in sequence. About every 15 seconds the server sends `{"type":"PING"}`. Ignore that frame for event sequencing.

Where WebSocket upgrades are available, reconnect after a close with the last contiguous sequence applied. A hosted connection can end at the function's duration limit. Use HTTP polling if upgrades fail or the socket closes repeatedly. The web app uses polling by default.

## Development injection

`POST /api/v1/sim/journeys/{id}/inject` returns 404 unless the API process has `SIM_DEV_ENDPOINTS=1`. When enabled, send `{"kind":"FORCE_MODE","params":{"mode":"STALLED"}}`, for example. The response is the current journey snapshot. Injections share the journey lock with normal actions.

| Kind | Parameters and effect |
|---|---|
| `FORCE_MODE` | `mode` is MOVING, STOPPED, STALLED, DETOUR, or GPS_LOST. Optional `duration_ticks` is 1–180. A driver must be en route. |
| `DRIVER_CANCEL` | Empty params. Cancels the en-route driver and runs the usual recovery rules. |
| `DRIVER_MESSAGE` | `text` is a string of 1–500 characters. Runs the normal advisory classifier. |
| `FORCE_CONFIRM_RESULT`, `FORCE_CANCEL_RESULT` | `provider` is PROVIDER_A through PROVIDER_D. `result` is CONFIRMED, FAILED, or UNKNOWN for the next provider operation of that kind. |
| `BACKUP_UNAVAILABLE` | `stage` is `search` (default) or `refresh`. Set it to null to clear the development override. |
| `FARE_SURGE` | `providers` is a nonempty list of provider IDs. `amount` is an integer increase in INR. A booked fare stays fixed. |
| `NEED_BY` | `minutes` is an integer from 1 to 1440, relative to the current simulation time. |

## Event reference

Every event has `event_id`, `journey_id`, gap-free per-journey `seq`, `timestamp`, nullable `ride_id`, `type`, and object `payload`. All quantities and provider outcomes are simulated. Fields below refer to the payload. The rider app uses neutral wording and treats classification as advisory. The demo console can display every event.

| Event | Emitted when | Payload fields | Screen |
|---|---|---|---|
| JOURNEY_CREATED | Journey created | scenario, is_simulated | Demo console |
| QUOTES_READY | Initial quotes or injected fare change | quotes | Rider quotes, demo |
| RIDE_CONFIRMED | Primary or replacement verified accepted | ride, replacement | Rider tracking |
| TELEMETRY_UPDATED | World emits a position sample | distance_to_pickup_m, eta_sec, gps_quality, is_simulated | Rider tracking, demo |
| RISK_UPDATED | Risk reassessed | band, score_0_100, confidence, signals, signal_details, model_version, is_simulated | Rider tracking, demo |
| EXPLANATION_VERIFIED | First explanation for a risk band or advisory chat | source, numbers_checked_against_telemetry (and signal for chat explanations) | Rider explanation |
| DEADLINE_DECISION | Policy evaluates waiting versus switching | seconds_until_deadline, wait_late_sec, switch_late_sec, wait_cost_points, switch_cost_points, recommendation, formula, decision_type, reasons, numbers | Rider rescue, demo |
| BACKUP_FOUND | Eligible candidate proposed | candidate | Rider rescue |
| APPROVAL_REQUIRED | Preemptive switch or opted-out recovery needs consent | reason, cancellation_fee_notice when applicable | Rider approval |
| SWITCH_APPROVED | Approved candidate refreshed and checked | new_provider, cancellation_fee_notice | Rider rescue |
| SWITCH_REJECTED | Rider declines proposal | reason | Rider rescue |
| QUOTE_REFRESHED | Provider refresh succeeds | candidate, not_a_reservation | Rider rescue, demo |
| QUOTE_REFRESH_FAILED | Refresh fails or exceeds cap | reason | Rider rescue |
| RECOVERY_CHECKED | Transaction verifies version or limits | step; version for version check; provider for limits check | Demo console |
| RIDE_CANCEL_REQUESTED | Cancellation sent to original provider | old_provider | Rider rescue progress |
| RIDE_CANCEL_CONFIRMED | Provider cancellation verified | old_provider | Rider rescue progress |
| DRIVER_CANCELLED | Simulated driver cancels | provider | Rider rescue |
| RECOVERY_STARTED | Bounded replacement confirmation starts | attempt, candidate | Rider rescue |
| RECOVERY_SUCCEEDED | Replacement confirmed | attempt, provider | Rider tracking |
| RECOVERY_BLOCKED | Policy or cancellation prevents continuation | reason | Rider rescue |
| REPLACEMENT_QUOTE_LOST | Replacement confirmation fails after cancellation | reason | Rider recovery gap |
| RECOVERY_EXHAUSTED | No eligible backup, attempt cap, or rider declines an unbooked replacement | reason; original_cancellation_confirmed in legacy events | Rider terminal outcome |
| RECONCILIATION_REQUIRED | Provider result uncertain, or six inconclusive status checks | step, reason (OUTCOME_UNKNOWN or VERIFICATION_REQUIRED) | Rider verification pending, demo |
| RECONCILED | Status resolves uncertain operation | step, outcome | Rider rescue progress, demo |
| DRIVER_ARRIVED | Driver reaches pickup | message | Rider pickup confirmation |
| PICKUP_CONFIRMED | Rider confirms boarding | message | Rider success |
| USER_CANCELLED | Rider stops journey | message | Rider terminal outcome |
| DRIVER_MESSAGE_CLASSIFIED | Advisory driver text classified | message, signal (label, evidence, is_advisory and optional LLM metadata) | Rider chat, demo |
| RISK_SIGNAL_ADDED | Chat contributes advisory evidence | signal, advisory_only | Demo console |
| ERROR | Unknown booking acknowledgement | code, message | Rider verification, demo |
| BOOKING_REQUESTED | Reserved by the event contract, currently never emitted | No emitted payload | Demo console |

S15 cancels the original, attempts two replacement providers, emits REPLACEMENT_QUOTE_LOST for each failure and ends with RECOVERY_EXHAUSTED. It has no replacement RIDE_CONFIRMED or RECOVERY_SUCCEEDED. REPLACEMENT_QUOTE_LOST can be followed by another bounded attempt.

During RECONCILING, playback performs status checks. An unresolved booking blocks further booking. After six inconclusive checks, VERIFICATION_REQUIRED leaves the journey reconciling with automatic action stopped.

## Generated contracts and fixtures

Generate OpenAPI from Python definitions with `python -m services.api.scripts.export_openapi` from the repository root after activating the API virtual environment. Edit route metadata and Pydantic models, then regenerate. The full schema drift test rejects differences.

Run `python -m services.api.scripts.export_examples` to produce the seven `contracts/examples/s*-http.json` fixtures. Each includes request bodies, HTTP responses, final snapshot and ordered events obtained over TestClient HTTP. Scenario IDs and clocks are deterministic. These fixtures cover S01, S03, S05, S13, S14, S15 and S17.

Run `services/api/scripts/check.sh` for fast checks or `services/api/scripts/check.sh --all` for statistical calibration and the 200-seed RANDOM smoke too. CI uses --all.
