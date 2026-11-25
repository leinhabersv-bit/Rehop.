"""Business acceptance baseline captured before the P05 simulator refactor."""

from datetime import timedelta

import pytest

from app.domain.errors import SimulationError
from app.domain.state_machine import ACTIVE_RIDE_STATES
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.simulation.engine import BASE_TIME, LOCATIONS, Session
from app.storage.ids import IdFactory


def start(scenario, *, auto=False, cap=650, minutes=20, book=True):
    request = JourneyCreate(
        pickup=LOCATIONS[0],
        dropoff=LOCATIONS[1],
        need_by=BASE_TIME + timedelta(minutes=minutes),
        policy=RecoveryPolicy(auto_rebook_on_confirmed_driver_cancel=auto, max_total_fare_inr=cap),
    )
    session = Session(request, scenario=scenario, scenario_ids=IdFactory())
    if book:
        session.book(session.quotes[0].quote_id, "initial")
    return session


def types(session):
    return [event.type for event in session.events]


def test_s01_healthy_pickup():
    session = start("S01")
    session.tick(25)
    session.confirm_pickup("board")
    assert session.state == "PICKUP_CONFIRMED"
    assert session.recovery_attempts == 0


def test_s02_temporary_traffic_needs_no_switch():
    session = start("S02")
    session.tick(25)
    assert session.ride.state == "DRIVER_ARRIVED"
    assert "APPROVAL_REQUIRED" not in types(session)


def test_s03_stall_requires_consent():
    session = start("S03")
    original = session.ride.ride_id
    session.tick(25)
    assert session.state == "AWAITING_APPROVAL"
    assert session.ride.ride_id == original
    assert session.recovery_attempts == 0
    session.approve_switch(True, "approve")
    assert session.ride.ride_id != original
    assert session.last_ride.state == "RIDER_CANCELLED"


def test_s04_driver_cancel_recovers_with_opt_in():
    session = start("S04", auto=True)
    session.tick(10)
    assert session.recovery_attempts == 1
    assert session.ride.state in ACTIVE_RIDE_STATES
    assert session.last_ride.state == "DRIVER_CANCELLED"


def test_s05_second_cancellation_has_bounded_recovery():
    session = start("S05", auto=True)
    session.tick(20)
    assert session.recovery_attempts == 2
    assert session.ride.state in ACTIVE_RIDE_STATES
    assert session.last_ride.state not in ACTIVE_RIDE_STATES


def test_s06_no_backup_exhausts():
    session = start("S06", auto=True)
    session.tick(20)
    assert session.state == "EXHAUSTED"
    assert session.ride is None


def test_s07_fare_cap_is_respected():
    session = start("S07", auto=True, cap=330)
    session.tick(20)
    assert session.state == "EXHAUSTED"
    assert session.recovery_attempts == 0
    for event in session.events:
        if event.type == "RIDE_CONFIRMED":
            ride = event.payload["ride"]
            quote = next(quote for quote in session.quotes if quote.quote_id == ride.quote_id)
            assert quote.estimated_fare_inr <= session.policy.max_total_fare_inr


def test_s08_stale_gps_abstains():
    session = start("S08")
    session.tick(25)
    assert session.risk.band == "UNKNOWN"
    assert all(event.payload.band != "HIGH" for event in session.events if event.type == "RISK_UPDATED")
    assert "APPROVAL_REQUIRED" not in types(session)


def test_s09_stationary_near_pickup_does_not_switch():
    session = start("S09")
    session.tick(25)
    assert "APPROVAL_REQUIRED" not in types(session)
    assert session.recovery_attempts == 0


def test_s10_arrival_race_has_one_terminal_outcome():
    session = start("S10")
    session.tick(6)
    session.confirm_pickup("board")
    with pytest.raises(SimulationError):
        session.cancel("too-late")
    session.tick(25)
    assert session.state == "PICKUP_CONFIRMED"
    assert (
        sum(kind in {"PICKUP_CONFIRMED", "USER_CANCELLED", "RECOVERY_EXHAUSTED"} for kind in types(session))
        == 1
    )


def test_s11_user_stop_ends_recovery():
    session = start("S11")
    session.tick(20)
    session.cancel("stop")
    attempts = session.recovery_attempts
    session.tick(25)
    assert session.state == "USER_CANCELLED"
    assert session.ride is None
    assert session.recovery_attempts == attempts


def test_s12_unknown_booking_never_duplicates():
    session = start("S12", book=False)
    for key in ("initial", "initial", "retry"):
        with pytest.raises(SimulationError) as error:
            session.book(session.quotes[0].quote_id, key)
        assert error.value.code == "BOOKING_UNCONFIRMED"
    assert session.state == "RECONCILING"
    assert session.ride is None
    assert session.ride_count == 0
    assert "RIDE_CONFIRMED" not in types(session)


def test_s13_driver_chat_is_advisory():
    session = start("S13")
    original = session.ride.ride_id
    session.tick(25)
    assert session.driver_chat_signal.label == "REQUEST_RIDER_CANCEL"
    assert session.ride.ride_id == original
    assert "RIDE_CANCEL_REQUESTED" not in types(session)


def test_s14_missing_refresh_preserves_original():
    session = start("S14")
    original = session.ride.ride_id
    session.tick(25)
    session.approve_switch(True, "approve")
    assert session.ride.ride_id == original
    assert "RIDE_CANCEL_REQUESTED" not in types(session)


def test_s15_post_cancel_loss_has_no_confirmed_ride():
    session = start("S15")
    session.tick(25)
    session.approve_switch(True, "approve")
    assert session.state == "EXHAUSTED"
    assert session.ride is None
    assert session.last_ride.state == "RIDER_CANCELLED"
    assert "RECOVERY_SUCCEEDED" not in types(session)


def test_s16_urgency_changes_proposal():
    urgent = start("S16", minutes=5)
    relaxed = start("S16", minutes=20)
    urgent.tick(9)
    relaxed.tick(9)
    assert urgent.ride.distance_to_pickup_m == relaxed.ride.distance_to_pickup_m
    assert urgent.pending_backup is not None
    assert relaxed.pending_backup is None
