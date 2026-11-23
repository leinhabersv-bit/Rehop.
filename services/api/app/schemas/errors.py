from pydantic import BaseModel

from app.domain.errors import SimulationError as SimulationError


class ErrorPayload(BaseModel):
    code: str
    message: str
    retryable: bool = False


class ErrorEnvelope(BaseModel):
    error: ErrorPayload
