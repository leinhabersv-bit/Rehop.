"""Seeded simulation starter, in-memory. Every number is fictional and explicitly labeled."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from threading import RLock
import random
from typing import Any
from uuid import uuid4
from app.intelligence.policy import ACTIVE_RIDE_STATES, may_rebook
from app.intelligence.risk import assess
from app.intelligence.recovery import rank_backups
from app.schemas.models import JourneyCreate, RecoveryPolicy

BASE_TIME = datetime(2026, 11, 23, 8, 30, tzinfo=timezone.utc)
LOCATIONS = [
    {'label': 'VIT Chennai', 'lat': 12.8406, 'lng': 80.1534},
    {'label': 'Chennai Airport', 'lat': 12.9941, 'lng': 80.1709},
    {'label': 'Guindy', 'lat': 13.0067, 'lng': 80.2206},
    {'label': 'T Nagar', 'lat': 13.0418, 'lng': 80.2341},
]
SCENARIOS = {
    'S01': 'Healthy pickup', 'S02': 'Temporary traffic stop',
    'S03': 'Driver stalled, ETA increasing', 'S04': 'Driver cancels',
    'S05': 'Second driver also cancels', 'S06': 'No available backup',
    'S07': 'Backups exceed fare cap', 'S08': 'Stale GPS updates',
    'S09': 'Near pickup, stationary', 'S10': 'Arrival/cancellation race',
    'S11': 'User cancels during recovery', 'S12': 'Booking status unknown',
}


class SimulationError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False, status: int = 409):
        super().__init__(message)
        self.code, self.retryable, self.status = code, retryable, status


class Session:
    def __init__(self, request: JourneyCreate, scenario: str = 'S01', seed: int = 2026):
        self.id = f'journey_{uuid4().hex[:12]}'
        self.pickup = request.pickup.model_dump()
        self.dropoff = request.dropoff.model_dump()
        self.policy = request.policy.model_dump()
        self.scenario = scenario
        self.seed = seed
        self.rng = random.Random(seed)
        self.clock = BASE_TIME
        self.state = 'CREATED'
        self.version = 0
        self.events: list[dict[str, Any]] = []
        self.quotes = self._make_quotes()
        self.ride: dict[str, Any] | None = None
        self.last_ride: dict[str, Any] | None = None
        self.pending_backup: dict[str, Any] | None = None
        self.risk: dict[str, Any] | None = None
        self.recovery_attempts = 0
        self.ride_count = 0
        self.ride_ticks = 0
        self.stationary_ticks = 0
        self.eta_delta_s = 0
        self.attempted_providers: set[str] = set()
        self.idempotency: dict[str, str] = {}
        self.booking_uncertain = False
        self.add_event('JOURNEY_CREATED', {'scenario': scenario, 'is_simulated': True})
        self.add_event('QUOTES_READY', {'quotes': self.quotes})
        self.state = 'WAITING_FOR_RIDE'

    def _make_quotes(self) -> list[dict[str, Any]]:
        base = [('UBER_SIM', 320, 300), ('RAPIDO_SIM', 285, 240),
                ('OLA_SIM', 360, 360), ('REDTAXI_SIM', 395, 540)]
        if self.scenario == 'S07':
            base = [('UBER_SIM', 300, 300), ('RAPIDO_SIM', 390, 240),
                    ('OLA_SIM', 420, 360), ('REDTAXI_SIM', 440, 540)]
        return [dict(quote_id=f'{self.id}_{name.lower()}', provider=name,
                     estimated_fare_inr=fare, pickup_eta_sec=eta,
                     expires_at=(BASE_TIME + timedelta(days=1)).isoformat(),
                     is_simulated=True) for name, fare, eta in base]

    def add_event(self, kind: str, payload: dict[str, Any], ride_id: str | None = None):
        self.version += 1
        event = dict(event_id=f'{self.id}_evt_{len(self.events)+1:04}',
                     journey_id=self.id, seq=len(self.events)+1,
                     timestamp=self.clock.isoformat(), type=kind,
                     ride_id=ride_id, payload=payload)
        self.events.append(event)
        return event

    def snapshot(self) -> dict[str, Any]:
        return dict(id=self.id, pickup=self.pickup, dropoff=self.dropoff,
                    created_at=BASE_TIME.isoformat(), state=self.state,
                    active_ride_id=self.ride['ride_id'] if self.ride else None,
                    version=self.version, last_event_seq=len(self.events),
                    policy=self.policy, quotes=self.quotes, active_ride=self.ride,
                    last_ride=self.last_ride, risk=self.risk,
                    pending_backup=self.pending_backup,
                    recovery_attempts=self.recovery_attempts,
                    booking_uncertain=self.booking_uncertain,
                    scenario=self.scenario, simulated_time=self.clock.isoformat(),
                    is_simulated=True)

    def _validate_version(self, expected_version: int | None):
        if expected_version is not None and expected_version != self.version:
            raise SimulationError('STALE_JOURNEY_VERSION', 'Refresh journey state before acting.', retryable=True)

    def book(self, quote_id: str, key: str, *, expected_version: int | None = None,
             replacement: bool = False) -> dict[str, Any]:
        if key in self.idempotency:
            return self.snapshot()
        self._validate_version(expected_version)
        if self.state in {'PICKUP_CONFIRMED','EXHAUSTED','USER_CANCELLED'}:
            raise SimulationError('INVALID_STATE', 'Journey is no longer accepting bookings.')
        if self.booking_uncertain:
            raise SimulationError('BOOKING_UNCONFIRMED', 'Prior booking outcome needs reconciliation.')
        if self.ride and self.ride['state'] in ACTIVE_RIDE_STATES:
            raise SimulationError('ACTIVE_RIDE_EXISTS', 'Cancel and verify existing ride before booking another.')
        if self.ride_count > 0 and not replacement:
            raise SimulationError('INVALID_STATE', 'Additional bookings must use the bounded recovery workflow.')
        quote = next((q for q in self.quotes if q['quote_id'] == quote_id), None)
        if not quote:
            raise SimulationError('QUOTE_NOT_FOUND', 'Quote is missing or expired.', retryable=True)
        if quote['estimated_fare_inr'] > self.policy['max_total_fare_inr']:
            raise SimulationError('POLICY_FARE_LIMIT', 'Ride exceeds the user-approved fare limit.')
        if self.clock >= datetime.fromisoformat(quote['expires_at']):
            raise SimulationError('QUOTE_EXPIRED', 'Request an updated quote.', retryable=True)
        if self.scenario == 'S12' and self.ride_count == 0:
            self.booking_uncertain = True
            self.state = 'AWAITING_APPROVAL'
            self.add_event('ERROR', {'code':'BOOKING_UNCONFIRMED','message':'Booking result unknown. Do not retry automatically.'})
            raise SimulationError('BOOKING_UNCONFIRMED','Booking response timed out; verification required.')
        self.ride_count += 1
        self.ride_ticks = 0
        self.stationary_ticks = 0
        self.eta_delta_s = 0
        self.risk = None
        self.pending_backup = None
        self.ride = dict(ride_id=f'ride_{self.ride_count}_{self.id}',
                         journey_id=self.id, provider=quote['provider'],
                         quote_id=quote_id, state='DRIVER_EN_ROUTE',
                         booked_at=self.clock.isoformat(), driver_id=f'SIM_DRIVER_{self.ride_count}',
                         distance_to_pickup_m=(100 if self.scenario == 'S09' else 2200),
                         eta_sec=quote['pickup_eta_sec'], last_position_at=self.clock.isoformat(),
                         cancellation_fee_inr=None, gps_quality='GOOD',
                         is_simulated=True)
        self.state = 'MONITORING'
        self.idempotency[key] = self.ride['ride_id']
        self.attempted_providers.add(quote['provider'])
        self.add_event('RIDE_CONFIRMED', {'ride':self.ride.copy(), 'replacement':replacement}, self.ride['ride_id'])
        if replacement:
            self.add_event('RECOVERY_SUCCEEDED', {'attempt':self.recovery_attempts, 'provider':quote['provider']}, self.ride['ride_id'])
        return self.snapshot()

    def _backups(self):
        provider = self.ride['provider'] if self.ride else (self.last_ride or {}).get('provider','')
        if self.scenario == 'S06':
            return []
        return rank_backups(self.quotes, excluding_provider=provider,
                            max_fare_inr=self.policy['max_total_fare_inr'],
                            attempted_providers=self.attempted_providers)

    def _recover_after_cancel(self):
        if self.state == 'USER_CANCELLED':
            return
        candidates = self._backups()
        if not candidates:
            self.state = 'EXHAUSTED'
            self.add_event('RECOVERY_EXHAUSTED', {'reason':'No eligible backup under fare and availability rules'})
            return
        candidate = candidates[0]
        if not self.policy['auto_rebook_on_confirmed_driver_cancel']:
            self.pending_backup = candidate
            self.state = 'AWAITING_APPROVAL'
            self.add_event('BACKUP_FOUND', {'candidate': candidate})
            self.add_event('APPROVAL_REQUIRED', {'reason':'Driver cancelled; approve a replacement booking.'})
            return
        permitted, reason = may_rebook(journey_state=self.state, active_ride_state=None,
                       attempts=self.recovery_attempts, max_attempts=self.policy['max_recovery_attempts'],
                       quote_fare_inr=candidate['estimated_fare_inr'],
                       max_fare_inr=self.policy['max_total_fare_inr'], original_cancel_confirmed=True)
        if not permitted:
            self.state = 'EXHAUSTED'
            self.add_event('RECOVERY_EXHAUSTED', {'reason':reason})
            return
        self.recovery_attempts += 1
        self.state = 'RECOVERING'
        self.add_event('RECOVERY_STARTED', {'attempt':self.recovery_attempts,'candidate':candidate})
        self.book(candidate['quote_id'], f'auto_recover_{self.id}_{self.recovery_attempts}', replacement=True)

    def driver_cancel(self):
        if not self.ride:
            return
        cancelled = self.ride.copy()
        self.ride['state'] = 'DRIVER_CANCELLED'
        self.last_ride = self.ride.copy()
        self.add_event('DRIVER_CANCELLED', {'provider':cancelled['provider']}, cancelled['ride_id'])
        self.ride = None
        self._recover_after_cancel()

    def tick(self, steps: int):
        for _ in range(steps):
            self.clock += timedelta(seconds=5)
            if not self.ride or self.state in {'USER_CANCELLED','PICKUP_CONFIRMED','EXHAUSTED'}:
                continue
            if self.ride['state'] == 'DRIVER_ARRIVED':
                continue
            self.ride_ticks += 1
            if self.scenario in {'S04','S05','S06','S07'} and self.ride_ticks >= 8 and (self.scenario != 'S05' or self.ride_count <= 2):
                self.driver_cancel()
                continue
            if self.scenario == 'S10' and self.ride_ticks >= 6:
                self._arrive()
                continue
            if self.scenario == 'S08' and self.ride_ticks >= 4:
                # Leave last_position_at unchanged: GPS freshness becomes unknown.
                gps_age = (self.clock - datetime.fromisoformat(self.ride['last_position_at'])).total_seconds()
                self.risk = assess(stationary_duration_s=self.stationary_ticks*5,
                        eta_delta_s=self.eta_delta_s, distance_to_pickup_m=self.ride['distance_to_pickup_m'],
                        gps_age_s=int(gps_age), gps_quality='POOR')
                self.add_event('RISK_UPDATED', self.risk, self.ride['ride_id'])
                continue
            stationary = self.scenario == 'S03' or (self.scenario == 'S02' and 3 <= self.ride_ticks <= 7) or self.scenario == 'S09'
            if stationary:
                self.stationary_ticks += 1
                self.eta_delta_s += 15
                self.ride['eta_sec'] += 15
            else:
                self.stationary_ticks = 0
                self.eta_delta_s = 0
                self.ride['distance_to_pickup_m'] = max(0, self.ride['distance_to_pickup_m']-150)
                self.ride['eta_sec'] = max(0, self.ride['eta_sec']-5)
            self.ride['last_position_at'] = self.clock.isoformat()
            self.add_event('TELEMETRY_UPDATED', {'distance_to_pickup_m':self.ride['distance_to_pickup_m'],
                           'eta_sec':self.ride['eta_sec'], 'gps_quality':'GOOD', 'is_simulated':True}, self.ride['ride_id'])
            self.risk = assess(stationary_duration_s=self.stationary_ticks*5,
                         eta_delta_s=self.eta_delta_s,
                         distance_to_pickup_m=self.ride['distance_to_pickup_m'],
                         gps_age_s=0, gps_quality='GOOD')
            self.add_event('RISK_UPDATED', self.risk, self.ride['ride_id'])
            if self.risk['band'] == 'HIGH' and not self.pending_backup:
                candidates = self._backups()
                if candidates:
                    self.pending_backup = candidates[0]
                    self.state = 'AWAITING_APPROVAL'
                    self.add_event('BACKUP_FOUND', {'candidate':self.pending_backup}, self.ride['ride_id'])
                    self.add_event('APPROVAL_REQUIRED', {'reason':'High pickup risk; preemptive switch needs user approval'}, self.ride['ride_id'])
                else:
                    self.add_event('RECOVERY_BLOCKED', {'reason':'No eligible backup'}, self.ride['ride_id'])
            if self.ride['distance_to_pickup_m'] <= 0:
                self._arrive()
        return self.snapshot()

    def _arrive(self):
        if not self.ride or self.ride['state'] == 'DRIVER_ARRIVED':
            return
        self.ride['state'] = 'DRIVER_ARRIVED'
        self.state = 'MONITORING'
        self.risk = None
        self.pending_backup = None
        self.add_event('DRIVER_ARRIVED', {'message':'Simulated driver reached pickup.'}, self.ride['ride_id'])

    def approve_switch(self, approved: bool, key: str, expected_version: int | None = None):
        if key in self.idempotency:
            return self.snapshot()
        self._validate_version(expected_version)
        if not self.pending_backup or self.state != 'AWAITING_APPROVAL':
            raise SimulationError('INVALID_STATE','No switch approval is pending.')
        if not self.ride and (not self.last_ride or self.last_ride['state'] != 'DRIVER_CANCELLED'):
            raise SimulationError('CANCEL_UNCONFIRMED','Cannot confirm original cancellation.')
        if not approved:
            self.idempotency[key] = 'rejected'
            self.add_event('SWITCH_REJECTED', {'reason':'Rider chose to keep waiting.'})
            self.pending_backup = None
            self.state = 'MONITORING'
            return self.snapshot()
        self.add_event('SWITCH_APPROVED', {'new_provider':self.pending_backup['provider']})
        if self.ride:
            old_ride = self.ride.copy()
            self.add_event('RIDE_CANCEL_REQUESTED', {'old_provider':old_ride['provider']}, old_ride['ride_id'])
            self.ride['state'] = 'RIDER_CANCELLED'
            self.last_ride = self.ride.copy()
            self.add_event('RIDE_CANCEL_CONFIRMED', {'old_provider':old_ride['provider']}, old_ride['ride_id'])
            self.ride = None
        candidate = self.pending_backup.copy()
        permitted, reason = may_rebook(journey_state=self.state, active_ride_state=None,
                    attempts=self.recovery_attempts, max_attempts=self.policy['max_recovery_attempts'],
                    quote_fare_inr=candidate['estimated_fare_inr'],
                    max_fare_inr=self.policy['max_total_fare_inr'], original_cancel_confirmed=True)
        if not permitted:
            self.state = 'EXHAUSTED'
            self.add_event('RECOVERY_BLOCKED', {'reason':reason})
            self.idempotency[key] = 'blocked'
            return self.snapshot()
        self.recovery_attempts += 1
        self.idempotency[key] = 'approved'
        self.state = 'RECOVERING'
        self.add_event('RECOVERY_STARTED', {'attempt':self.recovery_attempts,'candidate':candidate})
        return self.book(candidate['quote_id'],f'approve_rebook_{self.id}_{self.recovery_attempts}', replacement=True)

    def cancel(self, key: str, expected_version: int | None = None):
        if key in self.idempotency:
            return self.snapshot()
        self._validate_version(expected_version)
        if self.state == 'PICKUP_CONFIRMED':
            raise SimulationError('INVALID_STATE','Pickup already confirmed.')
        if self.ride:
            self.ride['state'] = 'RIDER_CANCELLED'
            self.last_ride = self.ride.copy()
            self.ride = None
        self.pending_backup = None
        self.state = 'USER_CANCELLED'
        self.idempotency[key] = 'cancelled'
        self.add_event('USER_CANCELLED', {'message':'Rider stopped the journey.'})
        return self.snapshot()

    def confirm_pickup(self, key: str, expected_version: int | None = None):
        if key in self.idempotency:
            return self.snapshot()
        self._validate_version(expected_version)
        if not self.ride or self.ride['state'] != 'DRIVER_ARRIVED':
            raise SimulationError('INVALID_STATE','Confirm pickup only after driver arrives.')
        self.ride['state'] = 'IN_PROGRESS'
        self.state = 'PICKUP_CONFIRMED'
        self.pending_backup = None
        self.idempotency[key] = 'picked_up'
        self.add_event('PICKUP_CONFIRMED', {'message':'Passenger boarded simulated ride.'},self.ride['ride_id'])
        return self.snapshot()


class SimulationStore:
    def __init__(self):
        self.sessions: dict[str, Session] = {}
        self.last_scenario: dict[str, str] = {}
        self.lock = RLock()

    def create(self, request: JourneyCreate, scenario: str = 'S01', seed: int = 2026):
        session = Session(request, scenario, seed)
        self.sessions[session.id] = session
        self.last_scenario[scenario] = session.id
        return session

    def get(self, journey_id: str):
        session = self.sessions.get(journey_id)
        if not session:
            raise SimulationError('JOURNEY_NOT_FOUND', 'Unknown journey.', status=404)
        return session


store = SimulationStore()
