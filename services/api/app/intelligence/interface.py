"""The journey engine's boundary to the existing intelligence implementation."""

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol, TypedDict, Unpack

from app.intelligence.config import RiskConfig
from app.intelligence.decision import compare_wait_switch
from app.intelligence.features import RideFeatures, compute_features
from app.intelligence.llm import (
    VerifiedExplanation,
    classify_driver_message,
    explain_with_verified_numbers,
)
from app.intelligence.policy import may_rebook
from app.intelligence.recovery import rank_backups
from app.intelligence.risk import RiskTracker, assess_v2
from app.schemas.domain import ChatSignal, DeadlineDecision, Quote, Ride, RiskAssessment, TelemetrySample
from app.schemas.enums import ChatLabel, JourneyState, Provider, RideState, RiskBand


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
    def assess(
        self,
        history: Sequence[TelemetrySample],
        ride: Ride,
        now: datetime,
        need_by: datetime,
        chat_signal: ChatSignal | None,
        tracker: RiskTracker,
    ) -> tuple[RideFeatures, RiskAssessment]: ...

    def classify_message(self, text: str, *, offline: bool = False) -> ChatSignal: ...

    def decide(self, **context: Unpack[DecisionContext]) -> DeadlineDecision: ...

    def rank_backups(self, quotes: list[Quote], **context: Unpack[BackupContext]) -> list[Quote]: ...

    def explain(self, template: str, numbers: list[int], *, offline: bool = False) -> VerifiedExplanation: ...

    def may_rebook(self, **context: Unpack[RecoveryContext]) -> tuple[bool, str]: ...


class DefaultIntelligence:
    """Apply the configured pickup risk model and delegate the other policies."""

    def __init__(self, config: RiskConfig | None = None) -> None:
        self.config = config if config is not None else RiskConfig()

    def assess(
        self,
        history: Sequence[TelemetrySample],
        ride: Ride,
        now: datetime,
        need_by: datetime,
        chat_signal: ChatSignal | None,
        tracker: RiskTracker,
    ) -> tuple[RideFeatures, RiskAssessment]:
        features = compute_features(history, ride, now, need_by)
        assessment = assess_v2(features, chat_signal, self.config)
        return features, tracker.update(ride.ride_id, assessment, self.config)

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
