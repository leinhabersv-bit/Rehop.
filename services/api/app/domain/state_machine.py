"""Allowed simulator state changes.

Journey
    CREATED -> WAITING_FOR_RIDE -> MONITORING <-> AWAITING_APPROVAL
                                       |                |
                                       +-> RECOVERING <-+
                                       |        |
                                       |        +-> MONITORING
                                       +-> PICKUP_CONFIRMED (terminal)

    WAITING_FOR_RIDE, MONITORING, AWAITING_APPROVAL, RECOVERING -> RECONCILING
    RECONCILING -> MONITORING | EXHAUSTED | USER_CANCELLED
    MONITORING, AWAITING_APPROVAL, RECOVERING -> EXHAUSTED (terminal)
    WAITING_FOR_RIDE, MONITORING, AWAITING_APPROVAL, RECOVERING -> USER_CANCELLED (terminal)
    AT_RISK is reserved. Risk currently changes without entering it.

Ride
    CONFIRMED -> DRIVER_EN_ROUTE -> DRIVER_ARRIVED -> IN_PROGRESS
                       |                  |
                       +-> DRIVER_CANCELLED <-+
                       +-> RIDER_CANCELLED  <-+

    COMPLETED and FAILED have no implemented transitions.
"""

from collections.abc import Mapping
from types import MappingProxyType

from app.domain.errors import SimulationError
from app.schemas.enums import JourneyState, RideState

TERMINAL_JOURNEY_STATES = frozenset(
    {JourneyState.PICKUP_CONFIRMED, JourneyState.USER_CANCELLED, JourneyState.EXHAUSTED}
)
ACTIVE_RIDE_STATES = frozenset(
    {RideState.CONFIRMED, RideState.DRIVER_EN_ROUTE, RideState.DRIVER_ARRIVED, RideState.IN_PROGRESS}
)

JOURNEY_TRANSITIONS: Mapping[JourneyState, frozenset[JourneyState]] = MappingProxyType(
    {
        JourneyState.CREATED: frozenset({JourneyState.WAITING_FOR_RIDE}),
        JourneyState.WAITING_FOR_RIDE: frozenset(
            {JourneyState.MONITORING, JourneyState.RECONCILING, JourneyState.USER_CANCELLED}
        ),
        JourneyState.MONITORING: frozenset(
            {
                JourneyState.AWAITING_APPROVAL,
                JourneyState.RECOVERING,
                JourneyState.RECONCILING,
                JourneyState.PICKUP_CONFIRMED,
                JourneyState.USER_CANCELLED,
                JourneyState.EXHAUSTED,
            }
        ),
        JourneyState.AT_RISK: frozenset(),
        JourneyState.AWAITING_APPROVAL: frozenset(
            {
                JourneyState.MONITORING,
                JourneyState.RECOVERING,
                JourneyState.RECONCILING,
                JourneyState.USER_CANCELLED,
                JourneyState.EXHAUSTED,
            }
        ),
        JourneyState.RECOVERING: frozenset(
            {
                JourneyState.MONITORING,
                JourneyState.RECONCILING,
                JourneyState.USER_CANCELLED,
                JourneyState.EXHAUSTED,
            }
        ),
        JourneyState.RECONCILING: frozenset(
            {JourneyState.MONITORING, JourneyState.EXHAUSTED, JourneyState.USER_CANCELLED}
        ),
        JourneyState.PICKUP_CONFIRMED: frozenset(),
        JourneyState.USER_CANCELLED: frozenset(),
        JourneyState.EXHAUSTED: frozenset(),
    }
)

RIDE_TRANSITIONS: Mapping[RideState, frozenset[RideState]] = MappingProxyType(
    {
        RideState.CONFIRMED: frozenset({RideState.DRIVER_EN_ROUTE}),
        RideState.DRIVER_EN_ROUTE: frozenset(
            {RideState.DRIVER_ARRIVED, RideState.DRIVER_CANCELLED, RideState.RIDER_CANCELLED}
        ),
        RideState.DRIVER_ARRIVED: frozenset(
            {RideState.IN_PROGRESS, RideState.DRIVER_CANCELLED, RideState.RIDER_CANCELLED}
        ),
        RideState.IN_PROGRESS: frozenset(),
        RideState.COMPLETED: frozenset(),
        RideState.DRIVER_CANCELLED: frozenset(),
        RideState.RIDER_CANCELLED: frozenset(),
        RideState.FAILED: frozenset(),
    }
)


def transition_journey(current: JourneyState, target: JourneyState, *, reason: str) -> JourneyState:
    if target not in JOURNEY_TRANSITIONS[current]:
        raise SimulationError(
            "INVALID_STATE", f"Cannot move journey from {current.value} to {target.value}: {reason}"
        )
    return target


def transition_ride(current: RideState, target: RideState, *, reason: str) -> RideState:
    if target not in RIDE_TRANSITIONS[current]:
        raise SimulationError(
            "INVALID_STATE", f"Cannot move ride from {current.value} to {target.value}: {reason}"
        )
    return target
