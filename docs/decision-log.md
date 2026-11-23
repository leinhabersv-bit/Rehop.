# Decisions

| Date | Decision | Why | Owners |
|---|---|---|---|
| 2026-11-23 | Four simulated provider adapters, no live cab platforms | No unapproved provider access; reproducible demo | All |
| 2026-11-23 | Next.js/React/TypeScript + Tailwind | Frontend parallelization | FE1, FE2 |
| 2026-11-23 | FastAPI/Pydantic + Python risk/policy | Typed API, independently testable policy | BE1, BE2 |
| 2026-11-23 | Preemptive switch requires rider approval | Avoids double bookings and fees | All |
| 2026-11-23 | Initial in-memory state, SQLite planned | One-command hackathon starter | BE1 |

New breaking schema changes require a reviewed PR here and edits to `contracts/` first.
