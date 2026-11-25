"""Request fingerprints and stored mutation responses."""

import hashlib
import json
from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel

from app.domain.errors import SimulationError
from app.schemas.domain import JourneySnapshot

if TYPE_CHECKING:
    from psycopg import Connection


class FailureResponse(BaseModel):
    code: str
    message: str
    status: int = 409
    retryable: bool = False

    @classmethod
    def from_error(cls, error: SimulationError):
        return cls(code=error.code, message=str(error), status=error.status, retryable=error.retryable)


class IdempotencyRecord(BaseModel):
    operation: str
    request_hash: str
    response: JourneySnapshot | FailureResponse

    def replay(self, operation: str, request_hash: str) -> JourneySnapshot:
        if operation != self.operation or request_hash != self.request_hash:
            raise key_reused()
        if isinstance(self.response, FailureResponse):
            raise SimulationError(
                self.response.code,
                self.response.message,
                status=self.response.status,
                retryable=self.response.retryable,
            )
        return self.response


def key_reused() -> SimulationError:
    return SimulationError("IDEMPOTENCY_KEY_REUSED", "This key belongs to a different request.", status=409)


def fingerprint(body: dict) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class IdempotencyStore(Protocol):
    def get(self, journey_id: str, key: str) -> IdempotencyRecord | None: ...

    def put(self, journey_id: str, key: str, record: IdempotencyRecord) -> None: ...


class MemoryIdempotencyStore:
    def __init__(self):
        self._records: dict[str, dict[str, IdempotencyRecord]] = {}

    def records(self, journey_id: str) -> dict[str, IdempotencyRecord]:
        return self._records.setdefault(journey_id, {})

    def get(self, journey_id: str, key: str) -> IdempotencyRecord | None:
        record = self.records(journey_id).get(key)
        return record.model_copy(deep=True) if record else None

    def put(self, journey_id: str, key: str, record: IdempotencyRecord) -> None:
        self.records(journey_id).setdefault(key, record.model_copy(deep=True))


class PostgresIdempotencyStore:
    """Share the transaction and parent-row lock held by the journey mutation."""

    def __init__(self, connection: "Connection"):
        self._connection = connection

    def get(self, journey_id: str, key: str) -> IdempotencyRecord | None:
        row = self._connection.execute(
            """
            SELECT operation, request_hash, response FROM ride_idempotency
            WHERE journey_id = %s AND key = %s
            """,
            (journey_id, key),
        ).fetchone()
        if row is None:
            return None
        operation, request_hash, response = row
        return IdempotencyRecord(operation=operation, request_hash=request_hash, response=response)

    def put(self, journey_id: str, key: str, record: IdempotencyRecord) -> None:
        from psycopg.types.json import Jsonb

        response = Jsonb(record.response.model_dump(mode="json"))
        self._connection.execute(
            """
            INSERT INTO ride_idempotency (journey_id, operation, key, request_hash, response)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (journey_id, record.operation, key, record.request_hash, response),
        )
