"""Locked journey commands using the existing local and hosted persistence paths."""

from collections.abc import Callable
from datetime import datetime, timedelta

from app.domain.invariants import check_invariants
from app.schemas.domain import JourneySnapshot
from app.schemas.requests import Location
from app.simulation.durable import open_ride


class JourneyService:
    def book(
        self,
        journey_id: str,
        quote_id: str,
        key: str,
        *,
        expected_version: int | None = None,
        rider_id: str | None = None,
        recent_ids: tuple[str, ...] = (),
    ) -> JourneySnapshot:
        with open_ride(journey_id, rider_id=rider_id, recent_ids=recent_ids) as journey:
            result = journey._idempotent(
                "book",
                key,
                {"quote_id": quote_id, "expected_version": expected_version},
                lambda: journey._book_primary(quote_id, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def approve_switch(
        self,
        journey_id: str,
        approved: bool,
        key: str,
        *,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "approve_switch",
                key,
                {"approved": approved, "expected_version": expected_version},
                lambda: journey._approve_switch(approved, expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def cancel(
        self,
        journey_id: str,
        key: str,
        *,
        expected_version: int | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "cancel",
                key,
                {"expected_version": expected_version},
                lambda: journey._cancel(expected_version),
            )
            check_invariants(journey.snapshot())
            return result

    def confirm_pickup(
        self,
        journey_id: str,
        key: str,
        *,
        expected_version: int | None = None,
        boarded_at: datetime | None = None,
        trip_duration: Callable[[Location, Location], timedelta] | None = None,
    ) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "confirm_pickup",
                key,
                {"expected_version": expected_version},
                lambda: journey._confirm_pickup(expected_version, boarded_at, trip_duration),
            )
            check_invariants(journey.snapshot())
            return result

    def driver_message(self, journey_id: str, text: str, key: str) -> JourneySnapshot:
        with open_ride(journey_id) as journey:
            result = journey._idempotent(
                "driver_message", key, {"text": text}, lambda: journey._message(text)
            )
            check_invariants(journey.snapshot())
            return result
