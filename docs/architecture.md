# RideRescue architecture v1.1 — pre-freeze correction

```text
 FE1: pickup, rider intent, deadline, preferences, provider quotes
 FE2: tracking, driver chat event, deadline decision, fee notice, recovery timeline
                             |
                      FastAPI REST / WS
                             |
 BE1: neutral provider simulation, event store, idempotency, quote TTL
   |       search / select / init / confirm / cancel / status / track
   |                      |
   |              ondc-shaped LOCAL adapters (NOT ONDC network clients)
   |
 BE2: advisory LLM modules + telemetry risk features + cost-of-wait decision
                             |
       DETERMINISTIC SAFETY POLICY authorizes or rejects each command
                             |
                BE1 records confirmed outcomes
```

## Rule of authority

- LLM: extracts a rider's intent, classifies *untrusted* driver text into an advisory signal, rewrites explanations without adding unsupported numerical claims.
- Risk/decision: evaluates model + GPS + ETA + `need_by` against quote and (conditional) cancellation cost. This is a recommendation, **not** a booking authorization.
- Policy: enforces explicit approval, valid states, no double active rides, idempotency, fare cap, fee cap, retry cap, fresh offers and terminal stop.
- Provider: reports action outcomes; a timed-out `confirm` remains `UNKNOWN`, never silently retried.

## Safe preemptive switch

1. Risk and urgency warrant a proposal; collect alternatives without booking concurrently.
2. Rider sees current ETA, `need_by`, fresh replacement estimate and conditional cancellation-fee illustration and chooses approve/decline.
3. Immediately before cancellation: `search` + `select` / `init` for a **fresh backup quote** and recheck budgets, expiry and limits. If unavailable, **do not cancel original**.
4. If available: `cancel` the original and await verified `on_cancel` semantics (locally simulated as immediate confirmed event).
5. Only after confirmed cancellation: `confirm` replacement and verify outcome. Do not claim `init` guarantees stock or hold.
6. If replacement vanishes after cancellation, retry bounded `search`/`confirm` where eligible or disclose "no confirmed ride". Never report success without a confirmed booking.

## Current limitations

`POST /api/v1/journeys` accepts an optional `scenario` query parameter. The default `S01` simulates a healthy pickup. `S03` stalls the original provider and lets the rider complete booking, recovery approval and pickup on the same journey ID. The request body, response fields and existing scenario endpoints retain their shapes.

The simulator uses a fixed clock for repeatable traces. A supplied pickup deadline must be later than the simulated start. Retrying a mutation uses the same idempotency key, operation, payload and expected version. Reusing an executed key for different input returns `IDEMPOTENCY_KEY_REUSED` (HTTP 409). An uncertain provider outcome blocks further booking until reconciliation. The simulator currently preserves that state for inspection, with no provider callback integration.

Automatic recovery after confirmed driver cancellation defaults to off. Clients that previously inherited automatic rebooking must now send `policy.auto_rebook_on_confirmed_driver_cancel: true` after the rider opts in. The preset cancellation scenarios explicitly enable automatic recovery to exercise the retry and spending safeguards.

Everything remains simulated and in memory. The ONDC naming is *architectural alignment*, not network membership. No real ride tracking, actual prices, charges, holds, guaranteed pickups, or fee payments are claimed. The simulator uses an illustrative 10%-up-to-Rs100 bound for certain no-valid-reason rider cancellations; applicable state/provider policies must replace this assumption in production.
