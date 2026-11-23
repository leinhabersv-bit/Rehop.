# RideRescue — PRE-FREEZE v1.1 amendment

**Status: implementation contract update.** This document supersedes inconsistent passages in the original 4-person blueprint and UI/UX guide. It is not evidence of live commercial integrations.

## Change 1 — neutral providers
All provider IDs, demo labels, tests and illustrations are now `PROVIDER_A`, `PROVIDER_B`, `PROVIDER_C`, `PROVIDER_D`, displayed as **Provider A–D (simulated)**. No commercial brand logos. No performance or cancellation claims about real companies. The official Namma Yatri name is used only as a **sourced ONDC protocol precedent**.

## Change 2 — ONDC/Beckn path
Local simulator adapters expose `search`, `select`, `init`, `confirm`, `cancel`, `status`, `track`. Product mapping: `get_quotes -> search/on_search`; `book -> select/init/confirm`; `cancel -> cancel/on_cancel`; `get_ride_state -> status/on_status + track/on_track`. These are a *local façade*, not a working ONDC connector. Detailed requirements: `docs/ondc-beckn-path.md`.

## Change 3 — bounded LLM engineering
Three testable language jobs: (a) rider text -> pickup/dropoff and `need_in_minutes`, always user-confirmed; (b) driver's chat "traffic 10 min" vs "cancel kar do" -> advisory classification, never driver-intent proof; (c) natural-language explanation rephrasing checked for invented numbers before display. A configurable OpenAI-compatible endpoint can perform this when a key is provided. Offline mode uses labeled rules/templates. Rule/policy engine controls all spending, cancel, retries, fees and switching regardless of the LLM output.

## Change 4 — urgency matters
`Journey.need_by` (timezone-aware ISO 8601) is the **latest acceptable pickup time**, not destination ETA. In the synthetic simulation the setup screen sets an offset from the simulation clock. Evaluate expected lateness for waiting and switching plus risk and cost penalties. Proposal only: no preemptive cancellation without approval. Counterfactual test S16 shows urgent vs relaxed outcome on identical movement.

## Change 5 — two-stage safe switch
1. Propose and show fee notice, deadlines, risks, latest quotes.
2. On approval, `search/select/init` backup immediately **before** cancellation, revalidate budget and quote TTL.
3. If backup vanished, keep original ride (S14).
4. If fresh backup exists, `cancel` original; await confirmed cancellation. Unknown means stop and reconcile.
5. Only now `confirm` replacement. A fresh quote is not a hold. A further race remains; S15 displays "No confirmed ride" rather than manufactured success.
6. Reactive recovery after driver cancellation follows user opt-in, fare/retry guards and confirmed provider state.

## Cancellation disclosure
MoRTH 2025 clause 18.2: 10% up to Rs100 **for cancellation without a valid reason**, conditional; state/provider rules may differ. Show illustrative `potential_fee_upper_bound_inr` and distinguish `actual_fee_inr=null`, `fee_confirmed=false`; respect `max_cancellation_fee_inr` before cancel. No universal fee claim.

## Four-person ownership
| Developer | Freeze deliverables |
|---|---|
| FE1 | Natural-language request input and mandatory confirm/edit; pickup `need_by`/urgency selector, quote display, price/fee cap and recovery opt-in |
| FE2 | Driver-chat classifier feedback, deadline decision, conditional fee approval UI, refresh/cancel/confirm timeline, residual no-ride state |
| BE1 | Neutral local provider simulators with ONDC-shaped actions, authoritative quote refresh, confirm/cancel status, API+WS contracts, races S14/S15 |
| BE2 | LLM classification/intent/verified explanations, risk + urgency cost comparison, policy caps, S13/S16 tests, adversarial eval |

## Acceptance gates
- `S03`: stalled pickup with explicit deadline-aware backup proposal.
- `S05`: confirmed second driver cancellation triggers bounded recovery.
- `S13`: chat classification adds signal, never autonomously cancels.
- `S14`: refreshed quote disappears *before* cancellation; original ride remains active.
- `S15`: offer is lost *after* cancellation; do not invent success.
- `S16`: urgency changes decision with otherwise comparable telemetry.
- No duplicate booking; stop upon boarding; all source/fee/LLM modes plainly labeled.

## Source register
- ONDC mobility spec: https://github.com/ONDC-Official/mobility-specification
- Namma Yatri about: https://www.nammayatri.in/about/
- MoRTH MVAG 2025: https://morth.gov.in/backend/documents/uploaded/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf
