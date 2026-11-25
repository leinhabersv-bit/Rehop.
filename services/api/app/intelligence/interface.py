"""The journey engine's boundary to the existing intelligence implementation."""

from datetime import datetime
from typing import Protocol, TypedDict, Unpack

from app.intelligence.decision import compare_wait_switch
from app.intelligence.llm import (
    VerifiedExplanation,
    classify_driver_message,
    explain_with_verified_numbers,
)
from app.intelligence.policy import may_rebook
from app.intelligence.recovery import rank_backups
from app.intelligence.risk import assess
from app.schemas.domain import ChatSignal, DeadlineDecision, Quote, RiskAssessment
from app.schemas.enums import ChatLabel, GpsQuality, JourneyState, Provider, RideState, RiskBand


class RiskInputs(TypedDict):
    stationary_duration_s: int
    eta_delta_s: int
    distance_to_pickup_m: int
    gps_age_s: int
    gps_quality: GpsQuality


class DecisionContext(TypedDict):
    now: datetime
    need_by: datetime
    current_eta_sec: int
    backup_eta_sec: int
    current_fare_inr: int
    backup_fare_inr: int
    cancellation_fee_upper_bound_inr: int
    risk_band: RiskBand
    chat_signal: ChatLabel | None


class BackupContext(TypedDict):
    excluding_provider: Provider | None
    max_fare_inr: int
    attempted_providers: set[Provider]


class RecoveryContext(TypedDict):
    journey_state: JourneyState
    active_ride_state: RideState | None
    attempts: int
    max_attempts: int
    quote_fare_inr: int
    max_fare_inr: int
    original_cancel_confirmed: bool


class IntelligencePort(Protocol):
    def assess(self, **inputs: Unpack[RiskInputs]) -> RiskAssessment: ...

    def classify_message(self, text: str, *, offline: bool = False) -> ChatSignal: ...

    def decide(self, **context: Unpack[DecisionContext]) -> DeadlineDecision: ...

    def rank_backups(self, quotes: list[Quote], **context: Unpack[BackupContext]) -> list[Quote]: ...

    def explain(self, template: str, numbers: list[int], *, offline: bool = False) -> VerifiedExplanation: ...

    def may_rebook(self, **context: Unpack[RecoveryContext]) -> tuple[bool, str]: ...


class DefaultIntelligence:
    """Delegate without changing inputs, policy decisions, or language fallback behavior."""

    def assess(self, **inputs: Unpack[RiskInputs]) -> RiskAssessment:
        return assess(**inputs)

    def classify_message(self, text: str, *, offline: bool = False) -> ChatSignal:
        return classify_driver_message(text, offline=offline)

    def decide(self, **context: Unpack[DecisionContext]) -> DeadlineDecision:
        return compare_wait_switch(**context)

    def rank_backups(self, quotes: list[Quote], **context: Unpack[BackupContext]) -> list[Quote]:
        return rank_backups(quotes, **context)

    def explain(self, template: str, numbers: list[int], *, offline: bool = False) -> VerifiedExplanation:
        return explain_with_verified_numbers(template, numbers, offline=offline)

    def may_rebook(self, **context: Unpack[RecoveryContext]) -> tuple[bool, str]:
        return may_rebook(**context)
