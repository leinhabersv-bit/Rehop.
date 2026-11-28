from typing import Any

from pydantic import BaseModel, Field

from app.domain.errors import SimulationError as SimulationError


class ErrorPayload(BaseModel):
    code: str
    message: str
    retryable: bool = False


class ErrorEnvelope(BaseModel):
    error: ErrorPayload = Field(json_schema_extra=ErrorPayload.model_json_schema())


class ValidationError(BaseModel):
    loc: list[str | int] = Field(title="Location")
    msg: str = Field(title="Message")
    type: str = Field(title="Error Type")
    input: Any = None
    ctx: dict = Field(default=None, title="Context")


class HTTPValidationError(BaseModel):
    detail: list[ValidationError] = Field(default_factory=list)
