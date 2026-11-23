# Decisions

| Date | Decision | Why | Owners |
|---|---|---|---|
| 2026-11-23 | Four simulated provider adapters, no live cab platforms | No unapproved provider access; reproducible demo | All |
| 2026-11-23 | Next.js/React/TypeScript + Tailwind | Frontend parallelization | FE1, FE2 |
| 2026-11-23 | FastAPI/Pydantic + Python risk/policy | Typed API, independently testable policy | BE1, BE2 |
| 2026-11-23 | Preemptive switch requires rider approval | Avoids double bookings and fees | All |
| 2026-11-23 | Initial in-memory state, SQLite planned | One-command hackathon starter | BE1 |

New breaking schema changes require a reviewed PR here and edits to `contracts/` first.

| 2026-11-23 | PRE-FREEZE v1.1: rename Provider A–D, remove platform branding | Simulators make no claims about real companies | All |
| 2026-11-23 | Add ONDC/Beckn-shaped adapters and protocol appendix | Document feasible future interoperability without suggesting live access | BE1 |
| 2026-11-23 | Add bounded LLM rider intent/chat/explanation with labeled fallback | Demonstrable agentic interpretation; policy keeps execution safe | BE2 + FE1 |
| 2026-11-23 | Add `need_by` timestamp and wait/switch score | Deadline-sensitive pickup matters | BE2 + FE1 |
| 2026-11-23 | Fresh quote prior to cancellation; show conditional fee notice | Avoid preventable no-ride gap; disclose unavoidable race | BE1 + FE2 |
