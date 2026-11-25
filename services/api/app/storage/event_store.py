"""Ordered, append-only journey events."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from threading import RLock
from typing import TYPE_CHECKING, Protocol

from app.schemas.domain import EventPayload, JourneyEvent
from app.schemas.enums import EventType

if TYPE_CHECKING:
    from psycopg import Connection


class EventStore(Protocol):
    def append(
        self, journey_id: str, event_type: EventType, payload: EventPayload, ride_id: str | None, at: datetime
    ) -> JourneyEvent: ...

    def list(self, journey_id: str, since_seq: int = 0) -> list[JourneyEvent]: ...

    def last_seq(self, journey_id: str) -> int: ...


def _event(journey_id, seq, event_type, payload, ride_id, at) -> JourneyEvent:
    return JourneyEvent(
        journey_id=journey_id,
        seq=seq,
        event_id=f"{journey_id}_evt_{seq:04}",
        type=event_type,
        payload=payload,
        ride_id=ride_id,
        timestamp=at.astimezone(UTC) if at.utcoffset() is not None else at,
    )


class MemoryEventStore:
    def __init__(self, events: Iterable[JourneyEvent] = ()):
        self._events: dict[str, list[JourneyEvent]] = {}
        self._lock = RLock()
        for event in events:
            self._events.setdefault(event.journey_id, []).append(event.model_copy(deep=True))

    def append(
        self, journey_id: str, event_type: EventType, payload: EventPayload, ride_id: str | None, at: datetime
    ) -> JourneyEvent:
        with self._lock:
            events = self._events.setdefault(journey_id, [])
            event = _event(journey_id, len(events) + 1, event_type, payload, ride_id, at).model_copy(
                deep=True
            )
            events.append(event.model_copy(deep=True))
            return event

    def list(self, journey_id: str, since_seq: int = 0) -> list[JourneyEvent]:
        with self._lock:
            return [
                event.model_copy(deep=True) for event in self._events.get(journey_id, [])[max(0, since_seq) :]
            ]

    def last_seq(self, journey_id: str) -> int:
        with self._lock:
            return len(self._events.get(journey_id, ()))


class PostgresEventStore:
    """Use the caller's transaction. The parent-row lock serializes sequence allocation."""

    _INSERT = """
        INSERT INTO ride_events (journey_id, seq, event_id, type, ride_id, ts, payload)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """

    def __init__(self, connection: Connection):
        self._connection = connection

    def append(
        self, journey_id: str, event_type: EventType, payload: EventPayload, ride_id: str | None, at: datetime
    ) -> JourneyEvent:
        self._connection.execute("SELECT id FROM ride_journeys WHERE id = %s FOR UPDATE", (journey_id,))
        seq = self.last_seq(journey_id) + 1
        event = _event(journey_id, seq, event_type, payload, ride_id, at)
        self._connection.execute(self._INSERT, self._parameters(event))
        return event

    def list(self, journey_id: str, since_seq: int = 0) -> list[JourneyEvent]:
        rows = self._connection.execute(
            """
            SELECT seq, event_id, type, ride_id, ts, payload
            FROM ride_events WHERE journey_id = %s AND seq > %s ORDER BY seq
            """,
            (journey_id, since_seq),
        )
        return [
            JourneyEvent(
                journey_id=journey_id,
                seq=seq,
                event_id=event_id,
                type=kind,
                ride_id=ride_id,
                timestamp=at.astimezone(UTC),
                payload=payload,
            )
            for seq, event_id, kind, ride_id, at, payload in rows
        ]

    def last_seq(self, journey_id: str) -> int:
        row = self._connection.execute(
            "SELECT COALESCE(MAX(seq), 0) FROM ride_events WHERE journey_id = %s", (journey_id,)
        ).fetchone()
        return row[0]

    def sync_payload(self, journey_id: str, events: list[JourneyEvent]) -> None:
        """Backfill legacy events and append the new suffix under the parent's row lock."""
        last = self.last_seq(journey_id)
        if last > len(events):
            raise RuntimeError("The event store is ahead of the journey payload.")
        if last < len(events):
            with self._connection.cursor() as cursor:
                cursor.executemany(self._INSERT, [self._parameters(event) for event in events[last:]])

    @staticmethod
    def _parameters(event: JourneyEvent):
        from psycopg.types.json import Jsonb

        return (
            event.journey_id,
            event.seq,
            event.event_id,
            event.type.value,
            event.ride_id,
            event.timestamp,
            Jsonb(event.model_dump(mode="json")["payload"]),
        )
