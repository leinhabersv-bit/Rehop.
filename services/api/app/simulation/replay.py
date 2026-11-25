"""Rebuild the journey status recorded by its ordered event stream."""

from dataclasses import dataclass

from app.domain.errors import SimulationError
from app.schemas.enums import EventType, JourneyState
from app.storage.event_store import EventStore


@dataclass(frozen=True)
class ReplayedJourney:
    state: JourneyState
    active_ride_id: str | None


_STATE_BY_EVENT = {
    EventType.JOURNEY_CREATED: JourneyState.CREATED,
    EventType.QUOTES_READY: JourneyState.WAITING_FOR_RIDE,
    EventType.RIDE_CONFIRMED: JourneyState.MONITORING,
    EventType.DRIVER_ARRIVED: JourneyState.MONITORING,
    EventType.APPROVAL_REQUIRED: JourneyState.AWAITING_APPROVAL,
    EventType.RECOVERY_STARTED: JourneyState.RECOVERING,
    EventType.RECOVERY_EXHAUSTED: JourneyState.EXHAUSTED,
    EventType.REPLACEMENT_QUOTE_LOST: JourneyState.EXHAUSTED,
    EventType.PICKUP_CONFIRMED: JourneyState.PICKUP_CONFIRMED,
    EventType.USER_CANCELLED: JourneyState.USER_CANCELLED,
}


def replay_from_events(journey_id: str, event_store: EventStore | None = None) -> ReplayedJourney:
    if event_store is None:
        from app.simulation.durable import read_event_log

        events = read_event_log(journey_id)
    else:
        events = event_store.list(journey_id)
    if not events:
        raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)

    state = JourneyState.CREATED
    active_ride_id = None
    for event in events:
        kind = event.type
        state = _STATE_BY_EVENT.get(kind, state)
        if kind == EventType.RIDE_CONFIRMED:
            active_ride_id = event.ride_id
        elif kind in {EventType.DRIVER_CANCELLED, EventType.RIDE_CANCEL_CONFIRMED}:
            if active_ride_id == event.ride_id:
                active_ride_id = None
        elif kind == EventType.ERROR and event.payload.get("code") == "BOOKING_UNCONFIRMED":
            state = JourneyState.RECONCILING
        elif state == JourneyState.AWAITING_APPROVAL and (
            kind in {EventType.SWITCH_REJECTED, EventType.QUOTE_REFRESH_FAILED}
            or (
                kind == EventType.RECOVERY_BLOCKED
                and event.payload.get("reason") in {"POLICY_RETRY_LIMIT", "CANCELLATION_FEE_LIMIT"}
            )
        ):
            state = JourneyState.MONITORING if active_ride_id else JourneyState.EXHAUSTED
    return ReplayedJourney(state, active_ride_id)
