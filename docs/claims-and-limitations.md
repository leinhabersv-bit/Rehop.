# Accurate demo claims — v1.1

**Allowed when demonstrated:** four neutral simulated providers, an ONDC/Beckn-shaped local adapter interface, a configured LLM that parses rider instructions or driver messages, deadline-aware recommendations, deterministic policy checks, fresh backup lookups, explicit rider fee notice and event-backed simulated recovery.

**Not allowed:** claims that Provider A–D represent any real company's observed performance; live ONDC connectivity, commercial-provider access, automatic cancellation of a real ride, guaranteed backup reservation, guaranteed pickup, real performance metrics, actual INR savings, or actual cancellation fee collection.

**LLM disclosure:** Without an API key, message classification/intent parsing uses a deterministic, labeled fallback. Do not claim an LLM ran when `source` shows `rule_fallback`. External model requests may transmit rider-supplied text only when configured; do not send personal details in the demo.

**Fees:** MoRTH Motor Vehicle Aggregator Guidelines 2025, clause 18.2, states 10% of fare capped at Rs 100 for a rider cancellation *without a valid reason*. It is not a fixed fee for all cancellations; state rules and provider terms may vary. The app shows a conditional simulator illustration, not an actual provider-confirmed fee. Official link: https://morth.gov.in/backend/documents/uploaded/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf

**Protocol:** The open-network route is plausible but not automatically accessible: ONDC participation requires onboarding, credentials, signatures and conformant async workflows. Source: https://github.com/ONDC-Official/mobility-specification and https://www.nammayatri.in/about/
