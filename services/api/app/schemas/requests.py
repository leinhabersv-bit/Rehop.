from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Location(BaseModel):
    label: str = Field(min_length=1)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RecoveryPolicy(BaseModel):
    auto_rebook_on_confirmed_driver_cancel: bool = True
    max_total_fare_inr: int = Field(default=650, ge=1, le=100000)
    max_recovery_attempts: int = Field(default=2, ge=0, le=5)
    preemptive_switch_requires_approval: Literal[True] = True
    allow_same_provider_retry: bool = True
    max_cancellation_fee_inr: int = Field(default=100, ge=0, le=100)


class JourneyCreate(BaseModel):
    pickup: Location
    dropoff: Location
    policy: RecoveryPolicy = Field(default_factory=RecoveryPolicy)
    need_by: datetime | None = None  # latest acceptable simulated pickup time

    @model_validator(mode="after")
    def different_locations(self):
        if self.need_by is not None and (self.need_by.tzinfo is None or self.need_by.utcoffset() is None):
            raise ValueError("need_by requires a timezone offset")
        if self.pickup.label == self.dropoff.label:
            raise ValueError("Pickup and destination must differ")
        return self


class QuoteRequest(BaseModel):
    pickup: Location
    dropoff: Location


class BookRequest(BaseModel):
    quote_id: str
    idempotency_key: str = Field(min_length=3)
    expected_version: int | None = None


class ApprovalRequest(BaseModel):
    approved: bool
    idempotency_key: str = Field(min_length=3)
    expected_version: int | None = None


class ActionRequest(BaseModel):
    idempotency_key: str = Field(min_length=3)
    expected_version: int | None = None


class TickRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=180)


class ParseIntentRequest(BaseModel):
    text: str = Field(min_length=4, max_length=500)


class DriverMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    idempotency_key: str = Field(min_length=3)
