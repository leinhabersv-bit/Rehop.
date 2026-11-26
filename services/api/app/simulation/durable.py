"""Persist the simulation across cloud function invocations."""

import os
from contextlib import contextmanager
from datetime import UTC, datetime

from pydantic import BaseModel, Field, model_validator

from app.domain.errors import SimulationError
from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.intelligence.risk import RiskTracker
from app.schemas.domain import (
    ChatSignal,
    DeadlineDecision,
    FeeNotice,
    JourneyEvent,
    Quote,
    Ride,
    RiskAssessment,
)
from app.schemas.enums import JourneyState, Provider, RiskBand
from app.schemas.requests import JourneyCreate, Location, PlaybackSpeed, RecoveryPolicy
from app.simulation.clock import catch_up, tracking
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
    playing: bool = False
    speed: PlaybackSpeed = 1
    backup_unavailable_stage: str | None = None
    state: JourneyState
    version: int
    events: list[JourneyEvent]
    quotes: list[Quote]
    ride: Ride | None
    last_ride: Ride | None
    pending_backup: Quote | None
    risk: RiskAssessment | None
    risk_tracker: RiskTracker = Field(default_factory=RiskTracker)
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

    @model_validator(mode="before")
    @classmethod
    def restore_legacy_playback(cls, data):
        if isinstance(data, dict) and "playing" not in data and "scenario" in data:
            playing = not data.get("deterministic", False) and (
                script_for(data["scenario"]).auto_track or data.get("recovery_attempts", 0) > 0
            )
            return {**data, "playing": playing}
        return data

    def restore(self, idempotency_store: IdempotencyStore | None = None) -> Session:
        session = Session.__new__(Session)
        session.__dict__.update(self.__dict__)
        session.last_tick = None
        session.restore_stores(idempotency_store)
        session.restore_providers()
        # Payloads written before P04 only recorded rides on the journey.
        for ride in (session.last_ride, session.ride):
            if ride is not None:
                session.provider_states[ride.provider].rides.setdefault(ride.ride_id, ride.state)
        return session


def clock_now() -> datetime:
    return datetime.now(UTC)


def advance(session: Session, last_tick: datetime | None, now: datetime) -> datetime | None:
    """Compatibility entry point for manually supplied sessions."""
    with store.lock:
        return catch_up(session, last_tick, now)


@contextmanager
def journey_clock(session: Session, last_tick: datetime | None, now: datetime):
    session.last_tick = catch_up(session, last_tick, now)
    try:
        yield
    finally:
        if not tracking(session):
            session.last_tick = None
        elif session.last_tick is None:
            session.last_tick = now


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


def create_ride(request: JourneyCreate, scenario: str = "S01", *, profiled: bool | None = None) -> Session:
    if profiled is None:
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
                with journey_clock(session, session.last_tick, clock_now()):
                    yield session
                return
            known = (*recent_ids, local_booking_slots.get(rider_id))
            candidates = [store.sessions[known_id] for known_id in known if known_id in store.sessions]
            session._booking_guard = lambda: check_booking_slot(journey_id, candidates)
            previously_occupied = occupies_booking(session)
            try:
                with journey_clock(session, session.last_tick, clock_now()):
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
        connection.execute(
            "SELECT pg_advisory_xact_lock(hashtext('rehop.journey'), hashtext(%s))", (journey_id,)
        )
        row = connection.execute(
            "SELECT payload, last_tick FROM ride_journeys WHERE id = %s FOR UPDATE", (journey_id,)
        ).fetchone()
        if row is None:
            raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)

        payload, old_tick = row
        session = StoredSession.model_validate(payload).restore(PostgresIdempotencyStore(connection))
        if rider_id is not None:
            session._booking_guard = lambda: check_booking_slot(journey_id, candidates)
        with journey_clock(session, old_tick, clock_now()):
            previously_occupied = occupies_booking(session)
            try:
                yield session
            except SimulationError as error:
                # Some domain failures record idempotency and state before returning an error.
                failure = error
        last_tick = session.last_tick
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
