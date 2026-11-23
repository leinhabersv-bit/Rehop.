from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.schemas.domain import JourneySnapshot


def check_invariants(snapshot: JourneySnapshot) -> None:
    active_rides = {
        ride.ride_id: ride
        for ride in (snapshot.active_ride, snapshot.last_ride)
        if ride is not None and ride.state in ACTIVE_RIDE_STATES
    }
    if len(active_rides) > 1:
        raise AssertionError("Journey has more than one active ride")
    if snapshot.state in TERMINAL_JOURNEY_STATES and snapshot.pending_backup is not None:
        raise AssertionError("Terminal journey has a pending backup")
    if snapshot.recovery_attempts > snapshot.policy.max_recovery_attempts:
        raise AssertionError("Recovery attempt cap exceeded")

    if active_rides:
        ride = next(iter(active_rides.values()))
        quote = next((quote for quote in snapshot.quotes if quote.quote_id == ride.quote_id), None)
        if quote is None:
            raise AssertionError("Active ride has no fare quote")
        if quote.estimated_fare_inr > snapshot.policy.max_total_fare_inr:
            raise AssertionError("Active ride fare cap exceeded")
