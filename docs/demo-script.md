# RideRescue 3-minute judge demo — v1.1

1. **0:00–0:20** Accepted driver not moving; deadline matters, especially for a flight. All provider data synthetic.
2. **0:20–0:40** FE1 interprets "From VIT Chennai to Chennai Airport, pickup within 15 minutes" using configured LLM (show `source=llm`), then user confirms exact fields and permitted recovery limits.
3. **0:40–1:00** Show Provider A–D neutral quotes, confirm Provider A. Explain ONDC/Beckn-shaped adapter without claiming live ONDC access.
4. **1:00–1:35** S13 driver text "cancel kar do" classified as an *advisory signal*. Compare active ETA with `need_by`, explicit wait-versus-switch points, preemptive decision with human approval.
5. **1:35–2:10** Show conditional cancellation fee (10%, cap Rs100 **only in qualifying cases**), refresh backup quote while original remains active, rider approves, original cancellation confirmed, then Provider B booking confirmed.
6. **2:10–2:30** S05 another driver cancellation leads to bounded recovery to Provider C. New booking is never marked successful before confirmation.
7. **2:30–2:45** S14 destroys the refreshed backup: original ride **is not cancelled**. Mention S15 demonstrates an unavoidable post-cancel race, honestly reported.
8. **2:45–3:00** Show test suite and explicit limitation: simulation and protocol-ready mock adapters, no live ONDC/operator integration.

**One-slide ONDC story:** "A possible road to production: ONDC Mobility (Beckn). `get_quotes -> search`, `book -> select/init/confirm`, `cancel -> cancel`, `get_ride_state -> status/track`. Namma Yatri publicly uses these network standards. Our demo does not participate on ONDC."
