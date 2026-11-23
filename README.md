# RideRescue 🚕

**Your cab cancelled. Your plans shouldn't.**

A **simulation-first AI ride-recovery hackathon project**. RideRescue monitors simulated pickup progress, highlights likely pickup failure, finds a safe backup, and helps recover from confirmed driver cancellations **without unapproved parallel bookings**.

> ⚠️ **All providers, rides, fares, locations and telemetry shown by the demo are simulated.** This does not connect to Uber, Ola, Rapido, RedTaxi, or any real rider accounts. No real cab is booked or cancelled.

## What is in the starter?

- ✅ Mobile-friendly Next.js trip setup, fare comparison, live tracking and demo console.
- ✅ Python FastAPI service with versioned REST endpoints and ordered WebSocket events.
- ✅ Four **mock** provider identities: `UBER_SIM`, `OLA_SIM`, `RAPIDO_SIM`, `REDTAXI_SIM`.
- ✅ Explainable pickup-risk rules + hard-coded *safety policy* for approvals and recovery.
- ✅ Representative seeded simulation scenarios S01–S12, including a stalled pickup, two cancellations, budget limits and GPS uncertainty.
- ✅ Automated backend tests and a synthetic smoke-report command.
- 🟡 SQLite persistence, expanded scenarios, production-grade concurrency testing, and end-to-end UI tests are development milestones, **not finished features**.

## Tech stack

| Frontend | Backend | Intelligence | Collaboration |
|---|---|---|---|
| Next.js / React / TypeScript | FastAPI + Pydantic | Python rule baseline + deterministic policy | GitHub PRs |
| Tailwind CSS / TanStack Query | REST + WebSocket | Synthetic provider event engine | pytest / Vitest / Playwright planned |

## Run locally

Prerequisites: **Node.js 20+**, **Python 3.11+**. Two terminals are recommended.

**Terminal 1 — backend**

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

API docs: **http://localhost:8000/docs**. Health: **http://localhost:8000/health**.

**Terminal 2 — frontend**

```bash
cd apps/web
cp .env.example .env.local         # Windows: copy .env.example .env.local
npm install
npm run dev
```

Web app: **http://localhost:3000**. Open **/demo**, run S03, advance two simulated minutes, and inspect risk/backup options. Or use the regular trip setup and quote selection flow.

> The UI uses the backend as its source of truth. It does not generate fake location or booking-success events. A browser connection to the backend is required.

## Test and inspect

```bash
cd services/api && pip install -r requirements-dev.txt && pytest -q
# From repository root:
python eval/run_benchmark.py --seed 2026 --runs 1
```

The benchmark command is currently a **smoke report**, not a validated success-rate evaluation. Reports are generated to `eval/results/` (ignored by Git). The final hackathon team must add paired baselines, held-out scenario variants, and report real measured simulator-only values.

## Repository layout

```text
riderescue/
├── AGENTS.md                     # Rules for AI coding tools
├── contracts/
│   ├── openapi.yaml              # REST source of truth, generated from FastAPI
│   ├── events.schema.json        # Event envelope and allowed event types
│   └── examples/
├── apps/web/                     # FE1 + FE2 — Next.js
│   └── src/{app,components,hooks,lib,types}/
├── services/api/                 # BE1 + BE2 — FastAPI
│   ├── app/{routes,schemas,simulation,events,storage,intelligence}/
│   └── tests/{integration,simulation,intelligence}/
├── eval/                         # Simulation-only smoke and later benchmarks
├── docs/reference/              # The two original full team/design handoffs
└── .github/workflows/           # CI starter
```

## Four-person ownership

| Teammate | Branch prefix | What they own |
|---|---|---|
| **Frontend 1** | `feat/fe1-*` | Trip setup, quotes, API client, design tokens and routing |
| **Frontend 2** | `feat/fe2-*` | Driver tracking, risk evidence, recovery approval, timeline, demo console |
| **Backend 1** | `feat/be1-*` | APIs, state store, event stream, four mock provider adapters, simulation scenarios |
| **Backend 2** | `feat/be2-*` | Feature extraction, risk rules, recovery guards, idempotency safety and evaluation |

Read **`AGENTS.md`** and **`docs/reference/`** before starting work. To propose breaking changes, update machine-readable contracts and examples in a reviewed PR **first**.

## Safety invariants

1. No two active bookings within one journey by default.
2. No preemptive cancellation without user approval.
3. No replacement if cancellation result is unknown.
4. No rebooking beyond max fare or retry limits.
5. Stale GPS means uncertainty, not evidence of driver misconduct.
6. Stop automatic actions after boarding or explicit user cancellation.

## Suggested milestones

- **Contracts first** — freeze REST/event schemas; FE1 generates typed wrapper.
- **One vertical slice** — S01 healthy pickup and S03 stall to approval.
- **Safety edge cases** — S05 double cancellation, S07 budget rejection, S08 stale telemetry, S10 race, S12 timeout.
- **Demo & proof** — full E2E tests, simulator metrics and explicit limitations.

**Hackathon target:** 4 Dec 2026 internal feature freeze; planned submission by 6 Dec 2026 at 11:59 PM IST. Verify current event deadlines independently.

## Documentation

- [`docs/reference/RideRescue_Team_Execution_Blueprint.md`](docs/reference/RideRescue_Team_Execution_Blueprint.md) — full four-person development plan.
- [`docs/reference/RideRescue_4_Person_Team_Blueprint.pdf`](docs/reference/RideRescue_4_Person_Team_Blueprint.pdf) — PDF handoff.
- [`docs/reference/RideRescue_UI_UX_Tech_Stack_Guide.pdf`](docs/reference/RideRescue_UI_UX_Tech_Stack_Guide.pdf) — exact UI copy, tags, layouts, tech stack.
- [`docs/architecture.md`](docs/architecture.md), [`docs/claims-and-limitations.md`](docs/claims-and-limitations.md).

## Publishing to your GitHub account

This folder is initialized as a local Git repository. Create a **new empty public repository** called `riderescue` in GitHub (do **not** add a README or .gitignore because they're already included), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/riderescue.git
git branch -M main
git push -u origin main
```

Repository visibility may be changed later, but the Hackathon instructions in your project notes expect a public repository for the submission.

## License

MIT. Original code and visuals in this starter; provider names are used only to identify clearly simulated integrations.
