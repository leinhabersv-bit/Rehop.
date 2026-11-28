"""Paired simulated worlds driven through JourneyService and IntelligencePort."""

from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
from random import Random

from app.domain.errors import SimulationError
from app.domain.invariants import check_invariants
from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.schemas.requests import JourneyCreate, RecoveryPolicy
from app.services.journey_service import JourneyService
from app.simulation.engine import BASE_TIME, LOCATIONS, Session
from app.simulation.providers import ProviderRandom, SimulatedMobilityAdapter
from app.storage.ids import IdFactory

from eval.strategies import MANUAL_REBOOK_DELAY_SEC, STRATEGIES

HORIZON_SEC = 1800
FAMILIES = {
    "healthy": {
        "driver_cancel_hazard_per_min": 0,
        "stall_hazard_per_min": 0,
        "detour_hazard_per_min": 0,
        "gps_dropout_hazard_per_min": 0,
    },
    "temporary_stop": {"stall_hazard_per_min": 0.5, "mean_stall_sec": 30},
    "stall": {"stall_hazard_per_min": 0.8, "mean_stall_sec": 900},
    "cancel_prone": {"driver_cancel_hazard_per_min": 0.2},
    "stale_gps": {"gps_dropout_hazard_per_min": 0.6, "mean_stall_sec": 90},
}
DEADLINES_MIN = {"tight": 5, "normal": 10, "relaxed": 15}


def trip_spec(seed):
    rng = Random(f"{seed}:journey_RANDOM_{seed}_1:simulated-trip")
    return {
        "distance_m": rng.uniform(800, 4000),
        "deadline": rng.choice(list(DEADLINES_MIN)),
        "family": list(FAMILIES)[seed % len(FAMILIES)],
    }


class BenchmarkService(JourneyService):
    def __init__(self, seed, strategy):
        self.spec = trip_spec(seed)
        self.intelligence = STRATEGIES[strategy]()
        self.futures = {}
        self.original_trace = []

    def _create_driver_sim(self, journey):
        journey.ride.distance_to_pickup_m = round(self.spec["distance_m"])
        driver = super()._create_driver_sim(journey)
        shadow = driver.model_copy(deep=True)
        adapter = journey.adapters[journey.ride.provider]
        state = deepcopy(adapter.state)
        copy = SimulatedMobilityAdapter(
            adapter.profile,
            ProviderRandom(journey.seed, journey.id, adapter.name, state),
            name=adapter.name,
            state=state,
        )
        arrival = None
        cancellation = None
        trace = []
        for tick in range(1, (HORIZON_SEC + 300) // 5 + 1):
            now = journey.clock + timedelta(seconds=tick * 5)
            sample = shadow.tick(now, adapter.profile, copy.ride_rng(driver.ride_id))
            trace.append(
                (
                    tick * 5,
                    sample.model_dump(mode="json") if sample else None,
                    shadow.cancelled,
                )
            )
            if shadow.cancelled:
                cancellation = (now - BASE_TIME).total_seconds()
                break
            if shadow.remaining_distance_m <= 0:
                arrival = (now - BASE_TIME).total_seconds()
                break
        self.futures[driver.ride_id] = (arrival, cancellation)
        if journey.ride_count == 1:
            self.original_trace = trace
        return driver


def run_trip(seed, strategy, manual_delay=MANUAL_REBOOK_DELAY_SEC, keep_trace=False):
    spec = trip_spec(seed)
    deadline = DEADLINES_MIN[spec["deadline"]] * 60
    journey = Session(
        JourneyCreate(
            pickup=LOCATIONS[0],
            dropoff=LOCATIONS[1],
            need_by=BASE_TIME + timedelta(seconds=deadline),
            policy=RecoveryPolicy(
                auto_rebook_on_confirmed_driver_cancel=strategy != "B0"
            ),
        ),
        "RANDOM",
        seed,
        scenario_ids=IdFactory(),
        profiled=True,
    )
    for adapter in journey.adapters.values():
        adapter.profile = replace(adapter.profile, **FAMILIES[spec["family"]])
    service = BenchmarkService(seed, strategy)
    safety = {
        "duplicate_active_booking_count": 0,
        "over_cap_booking_count": 0,
        "post_stop_action_count": 0,
    }
    risks = []
    observed_original = []
    try:
        service.book(journey.id, journey.quotes[0].quote_id, "book", session=journey)
    except SimulationError as error:
        if error.code not in {"BOOKING_FAILED", "BOOKING_UNCONFIRMED"}:
            raise
    original_fare = journey.quotes[0].estimated_fare_inr
    original_arrival = next(iter(service.futures.values()), (None, None))[0]
    original_timely = original_arrival is not None and original_arrival <= deadline
    stopped_seq = None
    cancel_time = None
    for tick in range(HORIZON_SEC // 5):
        if journey.state in TERMINAL_JOURNEY_STATES:
            stopped_seq = journey.last_seq()
            break
        if journey.ride and journey.ride.state == "DRIVER_ARRIVED":
            service.confirm_pickup(journey.id, "board", session=journey)
            continue
        if journey.pending_backup and (
            strategy != "B0"
            or (
                cancel_time is not None
                and (journey.clock - BASE_TIME).total_seconds()
                >= cancel_time + manual_delay
            )
        ):
            service.approve_switch(journey.id, True, f"approve-{tick}", session=journey)
        before = journey.last_seq()
        service.tick(journey.id, 1, session=journey)
        for event in journey.events[before:]:
            if event.type == "DRIVER_CANCELLED":
                cancel_time = (event.timestamp - BASE_TIME).total_seconds()
            if event.type == "RISK_UPDATED":
                future = service.futures[event.ride_id]
                now = (event.timestamp - BASE_TIME).total_seconds()
                label = future[0] is None or future[0] > now + 300
                assessment = event.payload
                risks.append(
                    (assessment.score_0_100, int(label), assessment.band == "HIGH")
                )
        for event in journey.events[before:]:
            if event.ride_id == f"ride_1_{journey.id}" and event.type in {
                "TELEMETRY_UPDATED",
                "DRIVER_CANCELLED",
            }:
                observed_original.append(event.model_dump(mode="json"))
        active = sum(
            state in ACTIVE_RIDE_STATES
            for p in journey.provider_states.values()
            for state in p.rides.values()
        )
        safety["duplicate_active_booking_count"] += max(0, active - 1)
        try:
            check_invariants(journey.snapshot())
        except AssertionError:
            # Safety counters below identify the failing run before results are written.
            if active <= 1:
                raise
    events = journey.list_events()
    confirmed = []
    delays = []
    last_cancel = None
    fee = 0
    fares = {q.quote_id: q.estimated_fare_inr for q in journey.quotes}
    for event in events:
        if event.type == "QUOTES_READY":
            fares.update(
                {q.quote_id: q.estimated_fare_inr for q in event.payload["quotes"]}
            )
        elif event.type == "QUOTE_REFRESHED":
            q = event.payload["candidate"]
            fares[q.quote_id] = q.estimated_fare_inr
        if event.type in {"DRIVER_CANCELLED", "RIDE_CANCEL_CONFIRMED"}:
            last_cancel = event.timestamp
        if event.type == "RIDE_CANCEL_REQUESTED":
            notice = next(
                (
                    e.payload.get("cancellation_fee_notice")
                    for e in reversed(events[: event.seq])
                    if e.type == "SWITCH_APPROVED"
                ),
                None,
            )
            if notice:
                fee += (
                    notice.potential_fee_upper_bound_inr
                    if hasattr(notice, "potential_fee_upper_bound_inr")
                    else notice["potential_fee_upper_bound_inr"]
                )
        if event.type == "RIDE_CONFIRMED":
            ride = event.payload["ride"]
            quote_id = ride.quote_id if hasattr(ride, "quote_id") else ride["quote_id"]
            fare = fares[quote_id]
            safety["over_cap_booking_count"] += fare > journey.policy.max_total_fare_inr
            confirmed.append(fare)
            if last_cancel:
                delays.append((event.timestamp - last_cancel).total_seconds())
                last_cancel = None
    if stopped_seq is not None:
        service.tick(journey.id, 2, session=journey)
        safety["post_stop_action_count"] = sum(
            e.type in {"RIDE_CONFIRMED", "RECOVERY_STARTED", "RIDE_CANCEL_REQUESTED"}
            for e in journey.events[stopped_seq:]
        )
    original_arrival = next(iter(service.futures.values()), (None, None))[0]
    original_timely = original_arrival is not None and original_arrival <= deadline
    success = journey.state == "PICKUP_CONFIRMED"
    pickup = next(
        (
            (e.timestamp - BASE_TIME).total_seconds()
            for e in events
            if e.type == "PICKUP_CONFIRMED"
        ),
        None,
    )
    row = {
        "simulated": True,
        "seed": seed,
        "strategy": strategy,
        **spec,
        "state": journey.state,
        "success": success,
        "deadline_met": success and pickup <= deadline,
        "pickup_sec": pickup,
        "cancel_delays": delays,
        "original_timely": original_timely,
        "high": any(r[2] for r in risks),
        "switched": any(e.type == "SWITCH_APPROVED" for e in events),
        "extra_fare": confirmed[-1] - original_fare if confirmed else 0,
        "fee_bound": fee,
        **safety,
        "risk_observations": risks,
    }
    if keep_trace:
        row["original_trace"] = service.original_trace
        row["original_observed"] = observed_original
    return row
