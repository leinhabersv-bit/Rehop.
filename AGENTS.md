# RideRescue AI coding agent instructions

## Product truth
Simulation-only hackathon project: no real Uber/Ola/Rapido/RedTaxi provider integration; all fares, driver positions and outcomes are synthetic. Success means **pickup confirmed**, not booking accepted. Build an independently testable engine, not hard-coded frontend animations.

## Contract precedence
1. Machine-readable `contracts/openapi.yaml` and `contracts/events.schema.json`.
2. Existing code and tests on `main`.
3. `docs/reference/RideRescue_Team_Execution_Blueprint.md`.
4. `docs/reference/RideRescue_UI_UX_Tech_Stack_Guide.pdf`.

If specifications conflict, describe the discrepancy and propose a contract PR; do not silently invent another schema.

## Fixed technologies
- FE: Next.js App Router, React, TypeScript, Tailwind CSS, TanStack Query.
- BE: Python, FastAPI, Pydantic v2; SQLite milestone, in-memory starter; WebSockets + REST fallback.
- AI/risk: Python feature engineering and explainable baseline; optional ML classifier. A language model never authorizes a booking/cancellation.
- Simulation: single-process, five-second deterministic ticks, mock providers.

## Folder ownership
- **FE1:** `apps/web/src/app/` (routes/shell), `apps/web/src/components/setup/`, `apps/web/src/components/quotes/`, `apps/web/src/lib/api/`, shared design tokens.
- **FE2:** `apps/web/src/components/journey/`, `apps/web/src/components/simulator/`, `apps/web/src/hooks/`, journey UX and demo.
- **BE1:** `services/api/app/main.py`, `routes/`, `schemas/`, `simulation/`, `events/`, `storage/`, `contracts/` (with review).
- **BE2:** `services/api/app/intelligence/`, `services/api/tests/intelligence/`, `eval/`.

## Rules of action
1. Never create two active rides for one journey.
2. Never auto-cancel from stale, poor-quality, or one-off telemetry.
3. Every preemptive switch needs approval. Original ride cancellation must be confirmed **before** replacement booking.
4. Driver cancellation may auto-rebook only within explicit fare and attempt caps, when opted in.
5. Enforce idempotency and state-version safety on all mutations.
6. Stop rescue after pickup confirmed, user cancel, or exhausted attempts.
7. Never display model conclusions as driver misconduct.
8. Never claim simulation numbers are measured field outcomes.

## How to work
Implement one small task per branch; preserve module ownership; add tests; run commands; explain changes and limitations in PRs. End every AI coding response with changed files, tests run, observed result and outstanding contract decisions. Do not rewrite unrelated files.
