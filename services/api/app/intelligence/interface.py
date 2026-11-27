"""The journey engine's boundary to the existing intelligence implementation."""

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol, TypedDict, Unpack

from app.intelligence.config import DecisionConfig, RiskConfig
from app.intelligence.decision import Decision, DecisionContext, cancellation_fee_bound, decide
from app.intelligence.features import RideFeatures, compute_features
from app.intelligence.llm import (
    RideIntent,
    VerifiedExplanation,
    classify_driver_message,
    explain_with_verified_numbers,
    parse_ride_intent,
)
from app.intelligence.policy import may_rebook
from app.intelligence.recovery import RankedBackups, rank_backups
from app.intelligence.risk import RiskTracker, assess_v2
from app.schemas.domain import ChatSignal, Quote, Ride, RiskAssessment, TelemetrySample
from app.schemas.enums import JourneyState, Provider, RideState
from app.schemas.requests import Location, RecoveryPolicy
from app.simulation.profiles import PROFILES


class BackupContext(TypedDict):
    now: datetime
    policy: RecoveryPolicy
    excluding_provider: Provider | None
    attempted_providers: set[Provider]
    provider_cooldowns: dict[Provider, datetime]


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

    def parse_intent(self, text: str, locations: list[Location]) -> RideIntent: ...

    def decide(self, context: DecisionContext) -> Decision: ...

    def cancellation_fee_bound(self, fare_inr: int) -> int: ...

    def rank_backups(self, quotes: list[Quote], **context: Unpack[BackupContext]) -> RankedBackups: ...

    def explain(self, template: str, numbers: list[int], *, offline: bool = False) -> VerifiedExplanation: ...

    def may_rebook(self, **context: Unpack[RecoveryContext]) -> tuple[bool, str]: ...


class DefaultIntelligence:
    """Apply the configured pickup risk model and delegate the other policies."""

    def __init__(
        self, config: RiskConfig | None = None, decision_config: DecisionConfig | None = None
    ) -> None:
        self.config = config if config is not None else RiskConfig()
        self.decision_config = decision_config if decision_config is not None else DecisionConfig()

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

    def parse_intent(self, text: str, locations: list[Location]) -> RideIntent:
        return parse_ride_intent(text, locations)

    def decide(self, context: DecisionContext) -> Decision:
        return decide(context, self.decision_config)

    def cancellation_fee_bound(self, fare_inr: int) -> int:
        return cancellation_fee_bound(fare_inr, self.decision_config)

    def rank_backups(self, quotes: list[Quote], **context: Unpack[BackupContext]) -> RankedBackups:
        return rank_backups(quotes, **context, profiles=PROFILES, config=self.decision_config)

    def explain(self, template: str, numbers: list[int], *, offline: bool = False) -> VerifiedExplanation:
        return explain_with_verified_numbers(template, numbers, offline=offline)

    def may_rebook(self, **context: Unpack[RecoveryContext]) -> tuple[bool, str]:
        return may_rebook(**context)
