# Architecture | RideRescue v0.1

```text
Next.js FE1: setup/quotes     Next.js FE2: journey, risk, demo
             \                  /
               FastAPI REST + WebSocket  <- contracts/openapi.yaml
                         |
               BE1 event/source of truth
                |                  |
          mock providers       telemetry ticks
                                   |
                          BE2 risk features
                                   |
                          BE2 policy guardrails
                                   |
                         BE1 simulated operations
```

## Important separation

**BE1** is authoritative for simulated provider events and ride state. **BE2** recommends candidate actions and enforces spending, approval, and retry policy. **FE1/FE2** render backend data and may initiate explicit authorized actions but never invent ride outcomes.

## Current starter limitations

- Four provider names refer to **mock adapters only**. No actual Uber, Ola, Rapido or RedTaxi booking, data feed or official partner agreement.
- API stores data in memory; BE1 must implement SQLite transactions and durable idempotency before real-world use.
- The current simulated movement profiles cover representative cases; 12 scenarios are defined, but not all are complete adversarial reproductions.
- WebSocket events are emitted by polling the authoritative in-memory event log. For a single-process demo only.
- GPS positions are conceptual; the frontend map is not a real street map.
- Risk score is a transparent synthetic heuristic, not a field-validated probability. No claim of driver intent.
- Latest quote and cancellation status must be verified before any future production integration.

## Human approval boundary

A detected stall may initiate **parallel search**, never parallel active booking. Preemptive switches always require rider approval, confirmation of the old cancellation, and eligibility checks before a new booking. Reactive recovery occurs only when a driver cancellation is confirmed and the rider has opted into it.

Read the two original blueprints in `docs/reference/` before changing interfaces.
