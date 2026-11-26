"""Request-driven playback clock shared by local and hosted journeys."""

from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from app.schemas.enums import JourneyState, RideState

if TYPE_CHECKING:
    from app.simulation.engine import Session

TICK = timedelta(seconds=5)
MAX_CATCH_UP_TICKS = 180


def tracking(session: "Session") -> bool:
    return (
        session.playing
        and session.state in {JourneyState.MONITORING, JourneyState.AWAITING_APPROVAL}
        and session.ride is not None
        and session.ride.state == RideState.DRIVER_EN_ROUTE
    )


def catch_up(session: "Session", last_tick: datetime | None, now: datetime) -> datetime | None:
    """Advance under the caller's journey lock, preserving fractional time and capped debt."""
    from app.services.journey_service import JourneyService

    if not tracking(session):
        return None
    if last_tick is None:
        return now

    interval = TICK / session.speed
    service = JourneyService()
    for _ in range(min((now - last_tick) // interval, MAX_CATCH_UP_TICKS)):
        service.tick(session.id, 1, session=session)
        if not tracking(session):
            return None
        last_tick += interval
    return last_tick
