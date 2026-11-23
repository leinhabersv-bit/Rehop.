# ONDC / Beckn interoperability path — reference slide

## The future integration story

ONDC's official **mobility specification** is an adaptation of **Beckn mobility** standards. [Namma Yatri's about page](https://www.nammayatri.in/about/) says its product uses ONDC standards based on Beckn. This proves the protocol ecosystem is real, **not** that RideRescue can connect to it today or that the network automatically exposes every commercial cab app.

| Current RideRescue operation | ONDC/Beckn semantic action | Real integration detail |
|---|---|---|
| `get_quotes(...)` | `search` / `on_search` | Discover options; do **not** assume returned offers remain reservable |
| `select_candidate(...)` | `select` / `on_select` | Evaluate an offer and its terms |
| `prepare_booking(...)` | `init` / `on_init` | Initialize an order; not a guaranteed hold |
| `book(...)` | `confirm` / `on_confirm` | Authoritative booking confirmation, asynchronous in real network |
| `cancel(...)` | `cancel` / `on_cancel` | Must wait for confirmation; include cancellation terms/fees |
| `get_ride_state(...)` | `status` / `on_status`, `track` / `on_track` | State and tracking may be separate; coverage may vary |

**Important:** The simulator has a synchronous facade; ONDC uses messages, contexts, transaction IDs, authentication/signing, callbacks, network onboarding, registry, versioned domains and asynchronous timeouts. Live behavior must honor these rather than substituting local mock methods blindly.

## Production runway (not built)

1. Register or partner as an authorized buyer-app/network participant under the relevant mobility domain.
2. Select the correct protocol/domain/version and support registry, signed messages, callbacks and network-compliance tests.
3. Obtain authorized inventory/telemetry access with consent; implement provider-specific fee/hold semantics.
4. Add transactions, trace IDs, reconciliation/idempotency and controlled retries against asynchronous provider responses.
5. Audit Indian state-level aggregator obligations, rider consent, privacy and security before deployment.

## Credible pitch sentence

"We deliberately build against an ONDC/Beckn-shaped interface, so our simulation can be replaced with compliant network adapters when authorized access is available. Namma Yatri demonstrates that open mobility protocols are in production use; our hackathon does **not** claim it is connected."

Primary sources:
- https://github.com/ONDC-Official/mobility-specification
- https://www.ondc.org/pages/shared-mobility.html
- https://www.nammayatri.in/about/
- https://github.com/ONDC-Official/log-validation-utility
