# RIDE & SEEK

**Your ride. No interruptions.**

A **simulation-first AI ride-recovery hackathon project**. RIDE & SEEK monitors pickup progress, asks before switching an active ride, and automatically books the best available replacement after a confirmed driver cancellation within the rider’s limits. It then monitors the replacement. Some internal modules and published contracts retain the original RideRescue name.

> **All providers, rides, fares, locations and telemetry are simulated.** Provider A–D are synthetic adapters. All bookings, cancellations, and fees stay inside the simulator.

## What you can try

- ✅ Mobile-friendly Next.js trip setup, fare comparison, live pickup tracking and device-local ride history.
- ✅ Python FastAPI service with versioned REST endpoints and ordered WebSocket events.
- ✅ Four neutral **mock** providers: `PROVIDER_A`, `PROVIDER_B`, `PROVIDER_C`, `PROVIDER_D`.
- ✅ ONDC/Beckn-shaped *simulator* adapters: `search`, `select`, `init`, `confirm`, `cancel`, `status`, `track` (no network access).
- ✅ Real LLM integration when `OPENAI_API_KEY` is configured: bounded ride-intent parsing, driver-message classification and explanation rewriting; explicit deterministic fallbacks offline.
- ✅ Deadline-aware waiting-versus-switching recommendation, without allowing AI to authorize provider actions.
- ✅ Fresh-backup pre-cancellation validation and conditional 2025-guideline fee notice; fee is a simulated upper-bound illustration, **not** a provider quote.
- ✅ Representative seeded simulation scenarios S01–S16, including a stalled pickup, two cancellations, budget limits and GPS uncertainty.
- ✅ Automated backend tests and a synthetic smoke-report command.
- 🟡 This demo runs in a single process. Restarting the API clears journeys. SQLite persistence and production concurrency are future work.

## Tech stack

| Frontend | Backend | Intelligence | Collaboration |
|---|---|---|---|
| Next.js / React / TypeScript | FastAPI + Pydantic | AI interpreter + deterministic safety policy | GitHub PRs |
| Tailwind CSS / TanStack Query | REST + WebSocket | Synthetic provider event engine | pytest / Vitest / Playwright |

## Run locally

Use **Node.js 22.12 or later on the 22.x release line** and **Python 3.11** to match GitHub Actions. Open two terminals from the repository root.

**Terminal 1 — backend**

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell, activate the environment with `.\.venv\Scripts\Activate.ps1`. You can also use `.\.venv\Scripts\python.exe` in place of each `python` command after creating the environment.

[API docs](http://localhost:8000/docs) · [Health check](http://localhost:8000/health)

**Terminal 2 — frontend**

```bash
cd apps/web
npm ci
npm run dev
```

Open [RIDE & SEEK](http://localhost:3000) using `localhost`, which matches the API's default allowed browser origin. The frontend defaults to `http://localhost:8000`. To change it, copy `apps/web/.env.example` to `apps/web/.env.local` and change `NEXT_PUBLIC_API_BASE_URL`. If the web origin changes, set `CORS_ORIGINS` in the API process and restart both apps.

Use **Book** to enter a trip, review interpreted details, compare backend quotes, and start tracking. Standard pickups progress automatically on the API clock. **Your rides** stores recent ride references on the current device and reads their statuses from the API. See the [rider walkthrough](docs/demo-script.md).

### Traffic-aware routing

The pickup and destination menus group 34 Chennai-area locations, with separate airport terminals, hospitals, transit stations, work hubs, and landmarks. **Search any address or landmark** looks up other places on the map. The trip timing report shows the selected endpoints, distance, drive time, provider, traffic coverage, and calculation time. It also offers a copyable OSRM report and a Google Maps directions link.

Without a Google Maps key, RIDE & SEEK routes through OSRM using OpenStreetMap road data and labels the drive estimate as excluding traffic. To use Google Maps for the route, time and distance, enable **Maps JavaScript API** and **Routes API** in a billing-enabled Google Cloud project. Add a browser key restricted to your web origins and those APIs as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local` or your deployment's build environment, then rebuild. Public deployments using this option must also publish the site's terms of use and privacy policy. See the [Google Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies).

## Test and inspect

Run the frontend checks from `apps/web` after `npm ci`.

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run test
npm run build
```

Stop the development server before running a build in the same checkout so the two processes do not share conflicting `.next` output. Run `./scripts/check.sh` from `services/api` using the activated backend environment. For Windows alternatives and the smoke command, see the [backend quickstart](docs/backend-quickstart.md).

Run browser tests from `apps/web` after a production build. Activate the backend environment so the test runner can start the API. Use a build configured for the default API port and free ports 3000 and 8000 before the run.

```bash
npx playwright install chromium
npm run test:e2e
```

If both servers are already running elsewhere, set `REHOP_TEST_WEB` and `REHOP_TEST_API` to their URLs. The frontend build's API URL and the API's allowed browser origin must match those addresses.

The benchmark command writes a synthetic smoke report under `eval/results/`. Its output describes the seeded simulator runs.

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
├── docs/reference/              # Updated v1.1 handoffs and ONDC slide
└── .github/workflows/           # CI starter
```

**Backend developers:** Start with [the backend quickstart](docs/backend-quickstart.md) for setup, endpoints, validation commands, BE1/BE2 boundaries and safety rules.

## Four-person ownership

| Teammate | Branch prefix | What they own |
|---|---|---|
| **Frontend 1** | `feat/fe1-*` | Trip setup, quotes, API client, design tokens and routing |
| **Frontend 2** | `feat/fe2-*` | Driver tracking, risk evidence, recovery approval and ride history |
| **Backend 1** | `feat/be1-*` | APIs, state store, event stream, four mock provider adapters, simulation scenarios |
| **Backend 2** | `feat/be2-*` | Feature extraction, risk rules, recovery guards, idempotency safety and evaluation |

Read **`AGENTS.md`**, **`docs/design-freeze-v1.1.md`**, **`docs/ondc-beckn-path.md`**, and **`docs/reference/`** before starting work. To propose breaking changes, update machine-readable contracts and examples in a reviewed PR **first**.

## Safety invariants

1. No two active bookings within one journey by default.
2. No preemptive cancellation without user approval.
3. No replacement if cancellation result is unknown.
4. No rebooking beyond max fare or retry limits.
5. Stale GPS means uncertainty, not evidence of driver misconduct.
6. Stop automatic actions after boarding or explicit user cancellation.
7. LLM outputs are untrusted advisory signals, never autonomous bookings or cancellations.
8. Compare pickup deadline penalties with switching cost before proposing a preemptive switch.
9. Refresh the backup quote **before** cancellation; still disclose that this is not a reservation.
10. Show a conditional possible cancellation charge and seek rider approval; do not invent a real fee.

**Optional LLM.** Set `OPENAI_API_KEY` in the API process environment or copy `services/api/.env.example` to `services/api/.env`, set the key, and add `--env-file .env` to the Uvicorn command. The API can send selected rider or driver text to the configured model. With no key, it uses labeled rules and templates. Provider and policy code own all booking decisions.

**Future integration:** The ONDC mobility specification is built on Beckn. Namma Yatri publicly identifies itself as built on these standards. RideRescue is **ONDC-shaped, not ONDC-connected**: actual deployment needs compliant BAP/BPP partnerships, onboarding, auth, signing, callbacks, validation, payments and commercial agreements. See [`docs/ondc-beckn-path.md`](docs/ondc-beckn-path.md).

**2025 Guidelines:** Clause 18.2 mentions a passenger cancellation fee of **10% of fare capped at ₹100, conditional on no valid reason**. State/provider implementation may differ. RideRescue uses this only as an illustrative upper-bound notice in the simulation; it never asserts a charge was actually levied. See [`docs/cancellation-fees.md`](docs/cancellation-fees.md).

**Hackathon target:** 4 Dec 2026 internal feature freeze; planned submission by 6 Dec 2026 at 11:59 PM IST. Verify current event deadlines independently.

## Documentation

- [`docs/reference/RideRescue_Team_Execution_Blueprint.md`](docs/reference/RideRescue_Team_Execution_Blueprint.md) — full four-person development plan.
- [`docs/reference/RideRescue_4_Person_Team_Blueprint.pdf`](docs/reference/RideRescue_4_Person_Team_Blueprint.pdf) — PDF handoff.
- [`docs/reference/RideRescue_UI_UX_Tech_Stack_Guide.pdf`](docs/reference/RideRescue_UI_UX_Tech_Stack_Guide.pdf) — exact UI copy, tags, layouts, tech stack.
- [`docs/design-freeze-v1.1.md`](docs/design-freeze-v1.1.md) — authoritative pre-freeze amendments.
- [`docs/reference/RideRescue_Pre_Freeze_v1.1_Changes.pdf`](docs/reference/RideRescue_Pre_Freeze_v1.1_Changes.pdf) — concise amendment PDF.
- [`docs/reference/RideRescue_ONDC_Beckn_Production_Path.pptx`](docs/reference/RideRescue_ONDC_Beckn_Production_Path.pptx) — editable ONDC/Beckn pitch slide.
- [`docs/architecture.md`](docs/architecture.md), [`docs/claims-and-limitations.md`](docs/claims-and-limitations.md).

## License

MIT. Original code and visuals in this starter. All simulated providers use neutral identifiers.
