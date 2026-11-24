# RIDE & SEEK rider walkthrough

1. Set pickup, destination, and maximum pickup wait from the homepage.
2. Review the route, fare cap, and recovery limits. A stalled ride can only be switched with rider approval.
3. Select **Find my ride** and review the recommended pickup time and fare. Booking authorizes automatic replacement after a confirmed driver cancellation.
4. Open **Track your ride**. A standard pickup updates automatically from the simulator API. Select **Confirm boarding** once the driver arrives, or use **Cancel ride** to cancel.
5. Open **Your rides** to revisit recent bookings on this device. The API supplies the current status each time.

## Verification fixtures

Fault scenarios remain available to integration tests through the existing simulator API. The tests cover the stalled-driver approval path, cancellation with automatic recovery, unavailable backup quotes, and uncertainty. They use API fixtures to advance the simulator clock without rider-facing switches.

The backend is a single-process in-memory simulator. Provider A–D, rates, driver positions, and bookings are synthetic. [ONDC/Beckn path](ondc-beckn-path.md)
