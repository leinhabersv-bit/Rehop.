# Backend quickstart — ReHop (RideRescue simulator)

**Scope:** This repository is a simulation-only hackathon system. No actual cab provider is contacted. Product name: **ReHop**; some internal modules and contracts retain the `RideRescue` name. Do not rename API paths or enums without a reviewed contract change.

## One-time setup

From the repository root:

```bash
cd services/api
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Start the service (from `services/api`):

```bash
uvicorn app.main:app --reload --port 8000
```

- Open `http://localhost:8000/health` for the readiness check.
- Open `http://localhost:8000/docs` for interactive API examples.
- Use `http://localhost:3000` for the separate Next.js app. CORS defaults to this origin.
- No `OPENAI_API_KEY` is required for offline deterministic fallback behavior. Do not commit keys.
- The in-memory store resets on restart; persistence is **not** implemented yet.

## Every branch, before opening a pull request

From `services/api`:

```bash
./scripts/check.sh
```

This runs `ruff check .`, `ruff format --check .`, then `pytest -q --cov=app --cov-report=term-missing`. On Windows, use Git Bash/WSL or run those three commands separately in the same folder.

From the repository root:

```bash
python eval/run_benchmark.py --seed 2026 --runs 1
```

The benchmark is a **synthetic smoke report** and not a field performance claim. GitHub Actions runs the same backend checks on pushes and pull requests.

## Responsibility boundaries

| Developer | Primary folders | Responsibilities |
| --- | --- | --- |
| BE1 — Simulation/platform | `services/api/app/routes/`, `simulation/`, `schemas/`, `main.py`, `storage/`, `events/` | Neutral Provider A–D, journey lifecycle, quote freshness, WebSocket events, idempotency, concurrency and persistent-state milestone |
| BE2 — Intelligence/safety | `services/api/app/intelligence/`, `services/api/tests/intelligence/`, `eval/` | Risk signals, driver-message interpretation, rider-intent parsing, deadline policy, bounded recovery decisions, independent safety tests and evaluation |

**Both** review changes to `contracts/openapi.yaml`, `contracts/events.schema.json`, `contracts/examples/` and `app/schemas/models.py`. Do not silently invent response fields or change the enum names; coordinate with both frontend developers first.

## API workflow to test

1. `POST /api/v1/journeys` with pickup, dropoff, `policy` and `need_by`; keep returned journey ID and version.
2. The response includes **simulated** provider quotes. Compare `expires_at` with the response's `simulated_time`. Book using `POST /api/v1/journeys/{journey_id}/book` with `quote_id`, the current `expected_version`, and a unique `idempotency_key`. If the result is unknown, read the journey before taking further action. Reuse the key only for the same action and payload.
3. Read state at `GET /api/v1/journeys/{journey_id}` and events at `GET /api/v1/journeys/{journey_id}/events`. WebSocket: `/ws/journeys/{journey_id}` with `since_seq` for replay.
4. Advance a development scenario using `POST /api/v1/journeys/{journey_id}/tick` (simulated five-second ticks).
5. When a backup is proposed, use `POST /api/v1/journeys/{journey_id}/rescue/approve`, passing `approved`, the **current** `expected_version` and an `idempotency_key`.
6. Use `POST /api/v1/journeys/{journey_id}/pickup/confirm` only when the simulated driver arrived. The engine must stop recovery after pickup.
7. For reproducible demos: `GET /api/v1/scenarios` and `POST /api/v1/scenarios/{scenario_id}/run`. Try S03 (stall), S05 (repeated cancellation), S13 (driver message), S14/S15 (quote races) and S16 (urgency difference).

## Non-negotiable safety rules

- Never create two active rides for the same journey.
- An LLM may interpret user text and explain outcomes, **never** authorize a booking/cancel.
- No preemptive cancellation without explicit approval. Confirm the original cancellation before confirming a replacement.
- Refresh the replacement quote before cancellation. It may still expire later; report that honestly.
- Respect maximum fare, cancellation fee limits and retry limits; stop on confirmed pickup or user cancellation.
- Stale location readings do **not** prove malicious driver behavior.
- Claims about fares, time saved, fee amounts or provider reliability must remain clearly synthetic.

## Where to find the authoritative specifications

- `AGENTS.md` — instructions for AI coding assistants and module ownership.
- `docs/design-freeze-v1.1.md` — most recent contract changes.
- `contracts/openapi.yaml` and `contracts/events.schema.json` — machine-readable interfaces.
- `docs/ondc-beckn-path.md` — future integration architecture, **not** a live connector.
- `tests/` — examples of working requests and expected safety behavior.

## Pull-request checklist

1. Work in `feat/be1-...` or `feat/be2-...`; don't push unfinished work to `main`.
2. Keep changes within your module and add tests for changed behavior.
3. Run backend checks; paste the **actual** output or failure in the PR.
4. Update the API/event examples when behavior changes; request frontend review if the contract changes.
5. Describe any safety implications or remaining limitations. A green lint check alone does not establish correctness.
