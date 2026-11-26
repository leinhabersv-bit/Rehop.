"""Persist the simulation across cloud function invocations."""

import os
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

from app.domain.errors import SimulationError
from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.schemas.domain import (
    ChatSignal,
    DeadlineDecision,
    FeeNotice,
    JourneyEvent,
    Quote,
    Ride,
    RiskAssessment,
)
from app.schemas.enums import JourneyState, Provider, RideState, RiskBand
from app.schemas.requests import Location, RecoveryPolicy
from app.simulation.engine import Command, Session, store
from app.simulation.providers import ProviderState, ScenarioOverrides
from app.simulation.scenarios import script_for
from app.simulation.world import DriverSim
from app.storage.event_store import PostgresEventStore
from app.storage.idempotency import IdempotencyRecord, IdempotencyStore, PostgresIdempotencyStore

HOSTED = os.getenv("REHOP_HOSTED") == "1" or os.getenv("VERCEL") == "1"
local_booking_slots: dict[str, str] = {}


class StoredSession(BaseModel):
    id: str
    pickup: Location
    dropoff: Location
    policy: RecoveryPolicy
    need_by: datetime
    driver_chat_signal: ChatSignal | None
    decision: DeadlineDecision | None
    explained_bands: set[RiskBand]
    cancellation_fee_notice: FeeNotice | None
    scenario: str
    seed: int
    clock: datetime
    state: JourneyState
    version: int
    events: list[JourneyEvent]
    quotes: list[Quote]
    ride: Ride | None
    last_ride: Ride | None
    pending_backup: Quote | None
    risk: RiskAssessment | None
    recovery_attempts: int
    ride_count: int
    ride_ticks: int
    stationary_ticks: int
    eta_delta_s: int
    attempted_providers: set[Provider]
    idempotency: dict[str, tuple[Command, tuple[str, str] | None]] = {}
    idempotency_records: dict[str, IdempotencyRecord] = {}
    deterministic: bool = False
    provider_states: dict[Provider, ProviderState] = Field(default_factory=dict)
    provider_overrides: ScenarioOverrides = Field(default_factory=lambda: ScenarioOverrides(scripted=True))
    stall_ticks_remaining: int = 0
    driver_sim: DriverSim | None = None
    unconfirmed_ride: Ride | None = None
    booking_uncertain: bool
    boarded_at: datetime | None = None
    arrives_at: datetime | None = None

    def restore(self, idempotency_store: IdempotencyStore | None = None) -> Session:
        session = Session.__new__(Session)
        session.__dict__.update(self.__dict__)
        session.restore_stores(idempotency_store)
        session.restore_providers()
        # Payloads written before P04 only recorded rides on the journey.
        for ride in (session.last_ride, session.ride):
            if ride is not None:
                session.provider_states[ride.provider].rides.setdefault(ride.ride_id, ride.state)
        return session


def tracking(session: Session) -> bool:
    return (
        (script_for(session.scenario).auto_track or session.recovery_attempts > 0)
        and session.state == JourneyState.MONITORING
        and session.ride is not None
        and session.ride.state == RideState.DRIVER_EN_ROUTE
    )


def advance(session: Session, last_tick: datetime | None, now: datetime) -> datetime | None:
    from app.services.journey_service import JourneyService

    if not tracking(session):
        return None
    if last_tick is None:
        return now
    elapsed = (now - last_tick) // timedelta(seconds=5)
    for _ in range(min(elapsed, 180)):
        JourneyService().tick(session.id, 1, session=session)
        if not tracking(session):
            return None
        last_tick += timedelta(seconds=5)
    return last_tick


@contextmanager
def database():
    import psycopg

    url = os.getenv("DATABASE_URL")
    if not url:
        raise SimulationError(
            "STORAGE_UNAVAILABLE", "Ride storage is unavailable.", status=503, retryable=True
        )
    try:
        with psycopg.connect(url, connect_timeout=6) as connection:
            yield connection
    except psycopg.Error as error:
        raise SimulationError(
            "STORAGE_UNAVAILABLE", "Could not reach ride storage. Try again.", status=503, retryable=True
        ) from error


def create_ride(request, scenario="S01") -> Session:
    profiled = script_for(scenario).ordinary_profiled
    if not HOSTED:
        with store.lock:
            return store.create(request, scenario=scenario, profiled=profiled)
    from psycopg.types.json import Jsonb

    session = Session(request, scenario, profiled=profiled)
    payload = StoredSession.model_validate(vars(session)).model_dump(mode="json")
    with database() as connection:
        connection.execute(
            "INSERT INTO ride_journeys (id, payload) VALUES (%s, %s)",
            (session.id, Jsonb(payload)),
        )
        PostgresEventStore(connection).sync_payload(session.id, session.events)
    return session


def read_event_log(journey_id: str) -> list[JourneyEvent]:
    if not HOSTED:
        with store.lock:
            return store.get(journey_id).list_events()
    with database() as connection:
        event_store = PostgresEventStore(connection)
        events = event_store.list(journey_id)
        if events:
            return events
        # A journey created before the table was added may still have only the payload copy.
        row = connection.execute(
            "SELECT payload FROM ride_journeys WHERE id = %s FOR UPDATE", (journey_id,)
        ).fetchone()
        if row is None:
            raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)
        event_store.sync_payload(journey_id, StoredSession.model_validate(row[0]).events)
        return event_store.list(journey_id)


def occupies_booking(session: Session | StoredSession) -> bool:
    if session.state == JourneyState.PICKUP_CONFIRMED and session.arrives_at is not None:
        return session.arrives_at > datetime.now(UTC)
    if session.state == JourneyState.USER_CANCELLED and session.ride is not None:
        provider = session.provider_states.get(session.ride.provider)
        true_state = provider.rides.get(session.ride.ride_id) if provider is not None else None
        return (true_state or session.ride.state) in ACTIVE_RIDE_STATES
    return session.state not in TERMINAL_JOURNEY_STATES and bool(
        session.ride_count or session.booking_uncertain
    )


def check_booking_slot(journey_id: str, candidates: list[Session | StoredSession]) -> None:
    if any(session.id != journey_id and occupies_booking(session) for session in candidates):
        raise SimulationError(
            "ACTIVE_RIDE_EXISTS", "You already have an active ride. Open Your rides to manage it."
        )


@contextmanager
def open_ride(journey_id: str, *, rider_id: str | None = None, recent_ids: tuple[str, ...] = ()):
    if not HOSTED:
        with store.lock:
            session = store.get(journey_id)
            if rider_id is None:
                yield session
                return
            known = (*recent_ids, local_booking_slots.get(rider_id))
            candidates = [store.sessions[known_id] for known_id in known if known_id in store.sessions]
            session._booking_guard = lambda: check_booking_slot(journey_id, candidates)
            previously_occupied = occupies_booking(session)
            try:
                yield session
            finally:
                session._booking_guard = None
                if not previously_occupied and occupies_booking(session):
                    local_booking_slots[rider_id] = journey_id
        return
    from psycopg.types.json import Jsonb

    failure = None
    with database() as connection:
        candidates = []
        if rider_id is not None:
            connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (rider_id,))
            candidates = connection.execute(
                """
                SELECT payload FROM ride_journeys WHERE id <> %s AND (
                    id = ANY(%s::text[])
                    OR id = (SELECT journey_id FROM ride_booking_slots WHERE rider_id = %s::uuid)
                )
                """,
                (journey_id, list(recent_ids), rider_id),
            )
            candidates = [StoredSession.model_validate(payload) for (payload,) in candidates]
        row = connection.execute(
            "SELECT payload, last_tick FROM ride_journeys WHERE id = %s FOR UPDATE", (journey_id,)
        ).fetchone()
        if row is None:
            raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)

        payload, old_tick = row
        session = StoredSession.model_validate(payload).restore(PostgresIdempotencyStore(connection))
        if rider_id is not None:
            session._booking_guard = lambda: check_booking_slot(journey_id, candidates)
        now = datetime.now(UTC)
        last_tick = advance(session, old_tick, now)
        ride_id = session.ride.ride_id if session.ride else None
        previously_occupied = occupies_booking(session)
        try:
            yield session
        except SimulationError as error:
            # Some domain failures record idempotency and state before returning an error.
            failure = error
        if not tracking(session):
            last_tick = None
        elif last_tick is None or session.ride.ride_id != ride_id:
            last_tick = now
        updated = StoredSession.model_validate(vars(session)).model_dump(mode="json")
        if updated != payload or last_tick != old_tick:
            connection.execute(
                "UPDATE ride_journeys SET payload = %s, last_tick = %s WHERE id = %s",
                (Jsonb(updated), last_tick, journey_id),
            )
        PostgresEventStore(connection).sync_payload(journey_id, session.events)
        if rider_id is not None and not previously_occupied and occupies_booking(session):
            connection.execute(
                """
                INSERT INTO ride_booking_slots (rider_id, journey_id) VALUES (%s, %s)
                ON CONFLICT (rider_id) DO UPDATE SET journey_id = EXCLUDED.journey_id
                """,
                (rider_id, journey_id),
            )
    if failure is not None:
        raise failure
