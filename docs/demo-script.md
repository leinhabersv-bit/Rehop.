# ReHop 3-minute judge demo

1. **0:00–0:20** Open ReHop, choose **Find a ride**, and describe the trip: “From VIT Chennai to Chennai Airport, pickup within 15 minutes.” All shown locations, fares, and driver movement are simulated.
2. **0:20–0:45** Interpret the request and review pickup, destination and the 15-minute pickup deadline. Point out the interpreter source. The demo works without an API key using deterministic rules. Use the trip details and review the fare, fee and retry limits. Choose **Simulate a stalled pickup** before asking for quotes.
3. **0:45–1:10** Compare Provider A–D using their simulated fare, ETA and deadline indicators. Select Provider A and confirm. The booking response begins tracking. Pickup requires a separate boarding confirmation after arrival.
4. **1:10–1:45** Select **Track your ride** and advance two simulated minutes in the same journey. Compare the stalled driver's ETA, rider deadline and backup quote. Open the review and show the conditional fee illustration and the need for rider approval.
5. **1:45–2:20** Approve. Read the timeline in sequence: fresh backup quote, original cancellation confirmed, replacement confirmed. A fresh quote can disappear before booking. Advance the replacement's simulation clock until arrival and confirm boarding. The journey displays **Pickup confirmed**.
6. **2:20–3:00** Use **S14** to show an unavailable refreshed quote while the original ride remains active. If time permits, show **S15** ending without an active ride after the original cancellation. Close with the simulator boundary and the future ONDC/Beckn path.

## Further scenarios

| Scenario | What to verify |
| --- | --- |
| S05 | Advance time past both driver cancellations. The replacement attempts stay inside the rider's cap. |
| S08 | Advance until location readings become stale. The system displays telemetry uncertainty. |
| S12 | Select a quote and try booking. The simulator deliberately leaves the result unresolved, with rebooking blocked. |
| S13 | Advance the clock to see a simulated driver message classified as a signal. The rider still decides whether to switch. |
| S16 | Inspect the decision under a tight pickup deadline. |

The demo's local adapters map quote search, booking, cancellation and tracking to Beckn-style operations. Production ONDC participation requires formal onboarding and commercial integrations. [ONDC/Beckn path](ondc-beckn-path.md)
