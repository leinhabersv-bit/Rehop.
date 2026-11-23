# Cancellation fee disclosure — legal/UX reference

Under the [MoRTH Motor Vehicles Aggregator Guidelines, 2025](https://morth.gov.in/backend/documents/uploaded/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf), **clause 18.2** states a rider cancellation fee of **10% of fare, capped at Rs 100, when a passenger cancels without a valid reason** as specifically stated by the aggregator in its app/website. Clause 18.1 separately concerns a driver's unjustified cancellation penalty.

This is a **conditional guideline**, not evidence that a fee will be collected for every cancellation. State adoption, further state rules, reasons for cancellation, and the provider's presented actual fee can change what happens; e.g., Maharashtra's 2026 state rule may differ from the central 10% figure. The simulator must therefore **never label the 10% value an actual charged fee**.

## Required approval copy

> Possible cancellation fee: up to Rs {simulated_cap}. Calculated for illustration using the 2025 guideline (10% of fare, capped at Rs 100) for certain rider cancellations without a valid reason. **Not a verified fee from a live provider.** Actual fees and exemptions depend on applicable rules and the provider's terms. The backup quote has been refreshed, but is not reserved. You may still have no ride if availability changes after cancellation.

## Engineering guardrails

- Mock fee = `min(round(current_fare * 0.10),100)`; set `fee_confirmed=false` and `actual_fee_inr=null`.
- Enforce the rider's `max_cancellation_fee_inr` cap before requesting cancellation.
- If genuine provider fee is unknown in production, require explicit acceptance of a disclosed range or abort; do not invent a provider quote.
- Fee notice appears in preemptive switch approval; confirmed **driver cancellation** is a separate scenario.
- Do not imply the cancellation fee applies when rider cancellation has a valid reason.
