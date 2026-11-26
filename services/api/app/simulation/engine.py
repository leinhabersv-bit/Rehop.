"""Seeded simulation starter, in-memory. Every number is fictional and explicitly labeled."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import RLock

from app.domain.errors import SimulationError as SimulationError
from app.domain.state_machine import transition_journey
from app.intelligence.risk import RiskTracker
from app.schemas.domain import (
    ChatSignal,
    DeadlineDecision,
    EventPayload,
    FeeNotice,
    JourneyEvent,
    JourneySnapshot,
    Quote,
    Ride,
    RiskAssessment,
)
from app.schemas.enums import (
    EventType,
    JourneyState,
    Provider,
    RiskBand,
)
from app.schemas.requests import JourneyCreate, Location, PlaybackSpeed
from app.simulation.profiles import PROFILES
from app.simulation.providers import (
    ProviderRandom,
    ProviderState,
    SimulatedMobilityAdapter,
)
from app.simulation.scenarios import RANDOM_SCENARIO as RANDOM_SCENARIO
from app.simulation.scenarios import SCENARIOS as SCENARIOS
from app.simulation.scenarios import provider_overrides, script_for
from app.simulation.trip_duration import straight_line_distance_m
from app.simulation.world import DriverSim
from app.storage.event_store import MemoryEventStore
from app.storage.idempotency import (
    IdempotencyRecord,
    IdempotencyStore,
    MemoryIdempotencyStore,
)
from app.storage.ids import IdFactory

BASE_TIME = datetime(2026, 11, 23, 8, 30, tzinfo=UTC)
LOCATIONS = [
    # Keep the first two labels and their order for saved links and simulator fixtures.
    # OSM node 12108610361 (main gate) and way 550198336 (cab pickup area).
    Location(label="VIT Chennai", lat=12.8405315, lng=80.1530341),
    Location(label="Chennai Airport", lat=12.9825533, lng=80.167339),
    # OSM 1552376846 is the mapped arrivals-level road for the terminals.
    Location(label="Chennai Airport T1 (Domestic)", lat=12.983511, lng=80.1679605),
    Location(label="Chennai Airport T2 (International)", lat=12.9820693, lng=80.1641102),
    Location(label="Chennai Airport T4 (Domestic)", lat=12.9803903, lng=80.1595827),
    Location(label="Chennai Central Railway Station", lat=13.0825901, lng=80.2763077),
    Location(label="Chennai Egmore Railway Station", lat=13.0794001, lng=80.2627701),
    Location(label="Tambaram Railway Station West Entrance", lat=12.9251092, lng=80.1164784),
    Location(label="Koyambedu CMBT", lat=13.0665289, lng=80.2062855),
    Location(label="Kilambakkam Bus Terminus", lat=12.8722905, lng=80.0821575),
    Location(label="Madhavaram Bus Terminus", lat=13.1461042, lng=80.2216999),
    Location(label="Guindy", lat=13.0067, lng=80.2206),
    Location(label="T Nagar", lat=13.0418, lng=80.2341),
    Location(label="Marina Beach Lighthouse", lat=13.039631, lng=80.2794168),
    Location(label="Besant Nagar Beach Promenade", lat=13.0024519, lng=80.2719773),
    Location(label="Kapaleeshwarar Temple, Mylapore", lat=13.0336756, lng=80.2698945),
    Location(label="TIDEL Park, Taramani", lat=12.9893807, lng=80.2503328),
    Location(label="DLF IT Park, Ramapuram", lat=13.0236252, lng=80.1759083),
    Location(label="Phoenix Marketcity, Velachery", lat=12.9911279, lng=80.2159634),
    Location(label="Express Avenue, Royapettah", lat=13.0586461, lng=80.2641867),
    Location(label="Chennai Trade Centre, Nandambakkam", lat=13.0154329, lng=80.1912316),
    Location(label="IIT Madras Research Park Gate", lat=12.9899354, lng=80.2415758),
    Location(label="SIPCOT IT Park, Siruseri", lat=12.8316885, lng=80.2205304),
    Location(label="Anna Nagar Tower Park", lat=13.086483, lng=80.2153454),
    Location(label="Vadapalani Murugan Temple", lat=13.0529483, lng=80.2135971),
    Location(label="Apollo Hospitals, Greams Road", lat=13.0632248, lng=80.2515817),
    Location(label="MIOT International Hospital", lat=13.0207927, lng=80.1852559),
    Location(label="Stanley Medical College Hospital", lat=13.1041151, lng=80.2836547),
    Location(label="Fort St. George Museum", lat=13.080677, lng=80.2876057),
    Location(label="Government Museum, Egmore", lat=13.0699018, lng=80.2566558),
    Location(label="Vandalur Zoo Entrance", lat=12.8906413, lng=80.0809923),
    Location(label="Shore Temple Parking, Mamallapuram", lat=12.616743, lng=80.1953309),
    Location(label="Muttukadu Boat House", lat=12.8063999, lng=80.2422292),
    Location(label="Chetpet Eco Park", lat=13.0756583, lng=80.2434076),
]


Command = tuple[str, str | bool | None, int | None]


class Session:
    def __init__(
        self,
        request: JourneyCreate,
        scenario: str = "S01",
        seed: int = 2026,
        *,
        scenario_ids: IdFactory | None = None,
        profiled: bool = False,
    ):
        if request.need_by is not None and request.need_by <= BASE_TIME:
            raise SimulationError(
                "INVALID_PICKUP_DEADLINE", "Pickup deadline must follow simulation start.", status=422
            )
        self.id = scenario_ids.scenario(scenario, seed) if scenario_ids else IdFactory.rider()
        self.deterministic = scenario_ids is not None
        self.pickup = request.pickup.model_copy()
        self.dropoff = request.dropoff.model_copy()
        self.policy = request.policy.model_copy()
        self.need_by = request.need_by or (BASE_TIME + timedelta(minutes=20))
        self.driver_chat_signal: ChatSignal | None = None
        self.decision: DeadlineDecision | None = None
        self.explained_bands: set[RiskBand] = set()
        self.cancellation_fee_notice: FeeNotice | None = None
        self.scenario = scenario
        self.seed = seed
        self.clock = BASE_TIME
        self.playing = not self.deterministic and script_for(scenario).auto_track
        self.speed = 1
        self.last_tick: datetime | None = None
        self.backup_unavailable_stage: str | None = None
        self.state = JourneyState.CREATED
        self.version = 0
        self.events: list[JourneyEvent] = []
        self.provider_states: dict[Provider, ProviderState] = {}
        self.provider_overrides = provider_overrides(script_for(scenario, profiled=profiled))
        self.driver_sim: DriverSim | None = None
        self.stall_ticks_remaining = 0
        self.unconfirmed_ride: Ride | None = None
        self.restore_providers()
        self.quotes = self._make_quotes()
        self.ride: Ride | None = None
        self.last_ride: Ride | None = None
        self.pending_backup: Quote | None = None
        self.risk: RiskAssessment | None = None
        self.risk_tracker = RiskTracker()
        self.recovery_attempts = 0
        self.ride_count = 0
        self.ride_ticks = 0
        self.stationary_ticks = 0
        self.eta_delta_s = 0
        self.attempted_providers: set[Provider] = set()
        self.idempotency: dict[str, tuple[Command, tuple[str, str] | None]] = {}
        self.idempotency_records: dict[str, IdempotencyRecord] = {}
        self.restore_stores()
        self.booking_uncertain = False
        self.boarded_at: datetime | None = None
        self.arrives_at: datetime | None = None
        self.destination_speed: PlaybackSpeed | None = None
        self.destination_started_at: datetime | None = None
        self.add_event(EventType.JOURNEY_CREATED, {"scenario": scenario, "is_simulated": True})
        self.add_event(EventType.QUOTES_READY, {"quotes": self.quotes})
        self.state = transition_journey(
            self.state, JourneyState.WAITING_FOR_RIDE, reason="Initial quotes are ready."
        )

    def restore_stores(self, idempotency_store: IdempotencyStore | None = None) -> None:
        self._event_store = MemoryEventStore(self.events)
        self._booking_guard: Callable[[], None] | None = None
        if idempotency_store is None:
            memory = MemoryIdempotencyStore()
            memory.records(self.id).update(self.idempotency_records)
            self.idempotency_records = memory.records(self.id)
            idempotency_store = memory
        self._idempotency_store = idempotency_store

    def restore_providers(self) -> None:
        self._distance_km = straight_line_distance_m(self.pickup, self.dropoff) / 1000
        if self.provider_overrides.scripted and not self.provider_overrides.quote_offers:
            self.provider_overrides.quote_offers = provider_overrides(script_for(self.scenario)).quote_offers
        self.adapters = {}
        for name, profile in PROFILES.items():
            state = self.provider_states.setdefault(name, ProviderState())
            self.adapters[name] = SimulatedMobilityAdapter(
                profile,
                ProviderRandom(self.seed, self.id, name, state),
                name=name,
                state=state,
                overrides=self.provider_overrides,
            )

    def _make_quotes(self) -> list[Quote]:
        return [self._search(name) for name in self.adapters]

    def _search(self, name: Provider) -> Quote:
        return self.adapters[name].search(self.id, self.clock, self._distance_km)

    def driver_message(self, text: str, key: str) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().driver_message(self.id, text, key, session=self)

    def add_event(self, kind: EventType, payload: EventPayload, ride_id: str | None = None) -> JourneyEvent:
        event = self._event_store.append(self.id, kind, payload, ride_id, self.clock)
        self.version += 1
        self.events.append(event)
        return event

    def last_seq(self) -> int:
        return self._event_store.last_seq(self.id)

    def list_events(self, since_seq: int = 0) -> list[JourneyEvent]:
        return self._event_store.list(self.id, since_seq)

    def snapshot(self) -> JourneySnapshot:
        return JourneySnapshot(
            id=self.id,
            pickup=self.pickup,
            dropoff=self.dropoff,
            created_at=BASE_TIME,
            state=self.state,
            need_by=self.need_by,
            driver_chat_signal=self.driver_chat_signal,
            deadline_decision=self.decision,
            cancellation_fee_notice=self.cancellation_fee_notice,
            active_ride_id=self.ride.ride_id if self.ride else None,
            version=self.version,
            last_event_seq=len(self.events),
            policy=self.policy,
            quotes=self.quotes,
            active_ride=self.ride,
            last_ride=self.last_ride,
            risk=self.risk,
            pending_backup=self.pending_backup,
            recovery_attempts=self.recovery_attempts,
            booking_uncertain=self.booking_uncertain,
            scenario=self.scenario,
            simulated_time=self.clock,
            is_simulated=True,
            boarded_at=self.boarded_at,
            arrives_at=self.arrives_at,
            destination_speed=self.destination_speed,
            destination_started_at=self.destination_started_at,
        )

    def book(self, quote_id: str, key: str, *, expected_version: int | None = None) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().book(self.id, quote_id, key, expected_version=expected_version, session=self)

    def tick(self, steps: int) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().tick(self.id, steps, session=self)

    def approve_switch(
        self, approved: bool, key: str, expected_version: int | None = None
    ) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().approve_switch(
            self.id, approved, key, expected_version=expected_version, session=self
        )

    def cancel(self, key: str, expected_version: int | None = None) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().cancel(self.id, key, expected_version=expected_version, session=self)

    def confirm_pickup(
        self,
        key: str,
        expected_version: int | None = None,
        *,
        boarded_at: datetime | None = None,
        trip_duration: Callable[[Location, Location], timedelta] | None = None,
    ) -> JourneySnapshot:
        from app.services.journey_service import JourneyService

        return JourneyService().confirm_pickup(
            self.id,
            key,
            expected_version=expected_version,
            boarded_at=boarded_at,
            trip_duration=trip_duration,
            session=self,
        )


class SimulationStore:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.last_scenario: dict[str, str] = {}
        self.lock = RLock()
        self.scenario_ids = IdFactory()

    def create(
        self,
        request: JourneyCreate,
        scenario: str = "S01",
        seed: int = 2026,
        *,
        deterministic: bool = False,
        profiled: bool = False,
    ):
        session = Session(
            request,
            scenario,
            seed,
            scenario_ids=self.scenario_ids if deterministic else None,
            profiled=profiled,
        )
        self.sessions[session.id] = session
        return session

    def get(self, journey_id: str):
        session = self.sessions.get(journey_id)
        if not session:
            raise SimulationError("JOURNEY_NOT_FOUND", "Unknown journey.", status=404)
        return session


store = SimulationStore()
