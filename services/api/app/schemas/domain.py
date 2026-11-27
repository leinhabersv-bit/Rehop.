from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    Field,
    PlainSerializer,
    ValidationInfo,
    field_validator,
    model_serializer,
)

from app.schemas.enums import (
    ChatLabel,
    EventType,
    GpsQuality,
    JourneyState,
    OpStatus,
    Provider,
    RideState,
    RiskBand,
)
from app.schemas.requests import Location, PlaybackSpeed, RecoveryPolicy

Money = Annotated[int, Field(ge=0, strict=True)]
# Preserve the existing +00:00 spelling and datetime.isoformat() precision.
Timestamp = Annotated[AwareDatetime, PlainSerializer(lambda value: value.isoformat(), when_used="json")]


class Quote(BaseModel):
    quote_id: str
    provider: Provider
    estimated_fare_inr: Money
    pickup_eta_sec: int
    expires_at: Timestamp
    is_simulated: bool


class Ride(BaseModel):
    ride_id: str
    journey_id: str
    provider: Provider
    quote_id: str
    state: RideState
    booked_at: Timestamp
    driver_id: str
    distance_to_pickup_m: int
    eta_sec: int
    last_position_at: Timestamp
    cancellation_fee_inr: Money | None
    gps_quality: GpsQuality
    is_simulated: bool


class TelemetrySample(BaseModel):
    ride_id: str
    observed_at: Timestamp
    distance_to_pickup_m: int
    eta_sec: int
    lat: float | None = None
    lng: float | None = None
    gps_quality: GpsQuality


class RiskSignalDetail(BaseModel):
    code: str
    value: int | float | str
    threshold: int | float | str
    points: int


class RiskAssessment(BaseModel):
    score_0_100: int
    band: RiskBand
    confidence: float
    model_version: str
    signals: list[str]
    signal_details: list[RiskSignalDetail] | None = None
    explanation: str
    is_simulated: bool
    explanation_source: str | None = None

    @model_serializer(mode="wrap")
    def serialize(self, handler):
        data = handler(self)
        # This key appears only after an explanation is checked.
        if self.signal_details is None:
            data.pop("signal_details", None)
        if "explanation_source" not in self.model_fields_set:
            data.pop("explanation_source", None)
        return data


class ChatSignal(BaseModel):
    label: ChatLabel
    evidence: str
    source: str
    is_advisory: bool
    eta_claim_min: int | None = Field(default=None, ge=0, le=120)
    confidence: float | None = Field(default=None, ge=0, le=1)
    model: str | None = None
    latency_ms: float | None = Field(default=None, ge=0)

    @model_serializer(mode="wrap")
    def serialize(self, handler):
        data = handler(self)
        for key in ("eta_claim_min", "confidence", "model", "latency_ms"):
            if key not in self.model_fields_set:
                data.pop(key, None)
        return data


class FeeNotice(BaseModel):
    potential_fee_upper_bound_inr: Money
    actual_fee_inr: Money | None
    fee_confirmed: bool
    source: str
    caution: str


class DeadlineDecision(BaseModel):
    seconds_until_deadline: int
    wait_late_sec: int
    switch_late_sec: int
    wait_cost_points: int
    switch_cost_points: int
    recommendation: Literal["PROPOSE_SWITCH", "WAIT_AND_MONITOR"]
    formula: str


class OperationResult(BaseModel):
    status: OpStatus
    ride: Ride | None = None
    reason: str | None = None


EventValue = str | int | bool | Quote | list[Quote] | Ride | ChatSignal | FeeNotice | None
EventPayload = RiskAssessment | DeadlineDecision | dict[str, EventValue]


class JourneyEvent(BaseModel):
    event_id: str
    journey_id: str
    seq: int
    timestamp: Timestamp
    type: EventType
    ride_id: str | None
    payload: EventPayload

    @field_validator("payload", mode="before")
    @classmethod
    def validate_payload(cls, payload: object, info: ValidationInfo) -> object:
        if info.data.get("type") == EventType.RISK_UPDATED:
            return RiskAssessment.model_validate(payload)
        if info.data.get("type") == EventType.DEADLINE_DECISION:
            return DeadlineDecision.model_validate(payload)
        return payload


class PlaybackState(BaseModel):
    playing: bool
    speed: PlaybackSpeed


class JourneySnapshot(BaseModel):
    id: str
    pickup: Location
    dropoff: Location
    created_at: Timestamp
    state: JourneyState
    need_by: Timestamp
    driver_chat_signal: ChatSignal | None
    deadline_decision: DeadlineDecision | None
    cancellation_fee_notice: FeeNotice | None
    active_ride_id: str | None
    version: int
    last_event_seq: int
    policy: RecoveryPolicy
    quotes: list[Quote]
    active_ride: Ride | None
    last_ride: Ride | None
    risk: RiskAssessment | None
    pending_backup: Quote | None
    recovery_attempts: int
    booking_uncertain: bool
    scenario: str
    simulated_time: Timestamp
    is_simulated: bool
    boarded_at: Timestamp | None = None
    arrives_at: Timestamp | None = None
    destination_speed: PlaybackSpeed | None = None
    destination_started_at: Timestamp | None = None

    @model_serializer(mode="wrap")
    def serialize(self, handler):
        data = handler(self)
        for field in ("boarded_at", "arrives_at", "destination_speed", "destination_started_at"):
            if getattr(self, field) is None:
                data.pop(field, None)
        return data
