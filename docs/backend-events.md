# Journey playback and live events

The web app polls the same endpoint locally and on Vercel. A hosted request loads the saved session and runs any owed ticks under the journey lock before reading it. Each tick advances simulated time by five seconds. At 20×, one tick is due every 250 ms of wall time. At most 180 ticks run per catch-up. Subsequent requests can drain time still owed.

Ordinary auto-tracked journeys start at 1× once a driver is en route. Deterministic scenario runs start paused for manual ticking. The clock stops when no driver is en route or the journey must reconcile a provider result. A recovery proposal can remain visible while the original driver moves.

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
