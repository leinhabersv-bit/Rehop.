"""Deterministic permission and pickup cost policy. No provider calls."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.domain.state_machine import TERMINAL_JOURNEY_STATES
from app.intelligence.config import DecisionConfig
from app.intelligence.features import RideFeatures
from app.intelligence.policy import may_rebook
from app.schemas.domain import ChatSignal, DeadlineDecision, Quote, Ride, RiskAssessment
from app.schemas.enums import ChatLabel, DecisionType, JourneyState, RideState, RiskBand
from app.schemas.requests import RecoveryPolicy


@dataclass(frozen=True)
class DecisionContext:
    journey_state: JourneyState
    active_ride: Ride | None
    risk: RiskAssessment | None
    features: RideFeatures | None
    chat_signal: ChatSignal | None
    need_by: datetime
    now: datetime
    ranked_backups: Sequence[Quote]
    policy: RecoveryPolicy
    recovery_attempts: int
    last_rejection_at: datetime | None = None
    last_proposal_band: RiskBand | None = None
    last_ride: Ride | None = None
    current_fare_inr: int = 0
    cancellation_fee_upper_bound_inr: int = 0


@dataclass(frozen=True)
class Decision:
    type: DecisionType
    reasons: list[str]
    numbers: dict[str, int | None]
    candidate: Quote | None = None

    def to_deadline_event(self) -> DeadlineDecision:
        return _deadline_event(self.numbers, self.type, self.reasons)


def cancellation_fee_bound(fare_inr: int, config: DecisionConfig) -> int:
    return min(round(fare_inr * config.cancellation_fee_rate), config.cancellation_fee_cap_inr)


def _risk_points(band: RiskBand, config: DecisionConfig) -> int:
    return {
        RiskBand.UNKNOWN: config.unknown_risk_points,
        RiskBand.LOW: config.low_risk_points,
        RiskBand.MEDIUM: config.medium_risk_points,
        RiskBand.HIGH: config.high_risk_points,
    }[band]


def _costs(
    *,
    left: int,
    wait_eta: int | None,
    backup_eta: int | None,
    fare_increase: int,
    fee: int,
    band: RiskBand,
    chat_label: ChatLabel | None,
    config: DecisionConfig,
) -> dict[str, int | None]:
    wait_late = max(0, wait_eta - left) if wait_eta is not None else None
    switch_late = (
        max(0, backup_eta + config.switch_overhead_seconds - left) if backup_eta is not None else None
    )
    return {
        "seconds_until_need_by": left,
        "wait_late_sec": wait_late,
        "switch_late_sec": switch_late,
        "wait_cost": (
            wait_late * config.lateness_points_per_second
            + _risk_points(band, config)
            + (config.chat_cancel_points if chat_label == ChatLabel.REQUEST_RIDER_CANCEL else 0)
            if wait_late is not None
            else None
        ),
        "switch_cost": (
            switch_late * config.lateness_points_per_second
            + max(0, fare_increase) * config.fare_points_per_inr
            + fee * config.fare_points_per_inr
            if switch_late is not None
            else None
        ),
    }


def _worth_switch(numbers: dict[str, int | None], config: DecisionConfig) -> bool:
    wait, switch = numbers["wait_cost"], numbers["switch_cost"]
    return wait is not None and switch is not None and switch + config.minimum_improvement_margin < wait


def decide(ctx: DecisionContext, config: DecisionConfig) -> Decision:
    """Consider only observations and already ranked quote data."""
    ride = ctx.active_ride or ctx.last_ride
    band = ctx.risk.band if ctx.risk else RiskBand.UNKNOWN
    candidate = next(
        (
            quote
            for quote in ctx.ranked_backups
            if quote.estimated_fare_inr <= ctx.policy.max_total_fare_inr and quote.expires_at > ctx.now
        ),
        None,
    )
    active = ctx.active_ride
    numbers = _costs(
        left=int((ctx.need_by - ctx.now).total_seconds()),
        wait_eta=(ctx.features.eta_sec if ctx.features else active.eta_sec) if active else None,
        backup_eta=candidate.pickup_eta_sec if candidate else None,
        fare_increase=candidate.estimated_fare_inr - ctx.current_fare_inr if candidate else 0,
        fee=ctx.cancellation_fee_upper_bound_inr,
        band=band,
        chat_label=ctx.chat_signal.label if ctx.chat_signal else None,
        config=config,
    )

    def result(action: DecisionType, reason: str, selected: Quote | None = None) -> Decision:
        return Decision(action, [reason], numbers, selected)

    if ctx.journey_state in TERMINAL_JOURNEY_STATES:
        return result(DecisionType.STOP, "JOURNEY_STOPPED")
    if active and active.state in {RideState.DRIVER_ARRIVED, RideState.IN_PROGRESS}:
        return result(DecisionType.STOP, "DRIVER_ARRIVED")
    if ctx.journey_state == JourneyState.RECONCILING:
        return result(DecisionType.MONITOR, "RECONCILIATION_PENDING")
    if ride and ride.state == RideState.DRIVER_CANCELLED:
        if candidate is None:
            return result(DecisionType.STOP, "NO_ELIGIBLE_BACKUP")
        permitted, reason = may_rebook(
            journey_state=ctx.journey_state,
            active_ride_state=active.state if active else None,
            attempts=ctx.recovery_attempts,
            max_attempts=ctx.policy.max_recovery_attempts,
            quote_fare_inr=candidate.estimated_fare_inr,
            max_fare_inr=ctx.policy.max_total_fare_inr,
            original_cancel_confirmed=True,
        )
        if not permitted:
            return result(DecisionType.STOP, reason)
        if ctx.policy.auto_rebook_on_confirmed_driver_cancel:
            return result(DecisionType.REBOOK_AFTER_CANCEL, "CONFIRMED_DRIVER_CANCELLATION", candidate)
        return result(DecisionType.REQUEST_APPROVAL, "AUTOMATIC_REBOOKING_NOT_ENABLED", candidate)
    if band == RiskBand.UNKNOWN:
        return result(DecisionType.MONITOR, "TELEMETRY_UNRELIABLE")
    if band in {RiskBand.MEDIUM, RiskBand.HIGH} and active and active.state == RideState.DRIVER_EN_ROUTE:
        if ctx.recovery_attempts >= ctx.policy.max_recovery_attempts:
            return result(DecisionType.SEARCH_BACKUP, "POLICY_RETRY_LIMIT")
        if candidate is None:
            return result(DecisionType.SEARCH_BACKUP, "NO_ELIGIBLE_BACKUP")
        if ctx.cancellation_fee_upper_bound_inr > ctx.policy.max_cancellation_fee_inr:
            return result(DecisionType.SEARCH_BACKUP, "CANCELLATION_FEE_LIMIT")
        if not _worth_switch(numbers, config):
            return result(DecisionType.SEARCH_BACKUP, "INSUFFICIENT_IMPROVEMENT")
        risen = ctx.last_proposal_band == RiskBand.MEDIUM and band == RiskBand.HIGH
        if (
            ctx.last_rejection_at is not None
            and not risen
            and (ctx.now - ctx.last_rejection_at).total_seconds() < config.rejection_cooldown_seconds
        ):
            return result(DecisionType.SEARCH_BACKUP, "REJECTION_COOLDOWN")
        return result(DecisionType.REQUEST_APPROVAL, "SWITCH_IMPROVES_PICKUP_COST", candidate)
    return result(DecisionType.MONITOR, "NO_SWITCH_INDICATED")


def _deadline_event(
    numbers: dict[str, int | None], action: DecisionType, reasons: list[str] | None = None
) -> DeadlineDecision:
    return DeadlineDecision(
        seconds_until_deadline=max(0, numbers["seconds_until_need_by"] or 0),
        wait_late_sec=numbers["wait_late_sec"] or 0,
        switch_late_sec=numbers["switch_late_sec"] or 0,
        wait_cost_points=numbers["wait_cost"] or 0,
        switch_cost_points=numbers["switch_cost"] or 0,
        recommendation="PROPOSE_SWITCH" if action == DecisionType.REQUEST_APPROVAL else "WAIT_AND_MONITOR",
        formula="simulated heuristic; not guaranteed pickup or real money cost",
        decision_type=action if reasons is not None else None,
        reasons=reasons,
        numbers=numbers if reasons is not None else None,
    )


def compare_wait_switch(
    *,
    now: datetime,
    need_by: datetime,
    current_eta_sec: int,
    backup_eta_sec: int,
    current_fare_inr: int,
    backup_fare_inr: int,
    cancellation_fee_upper_bound_inr: int,
    risk_band: RiskBand,
    chat_signal: ChatLabel | None = None,
) -> DeadlineDecision:
    """Compatibility comparison for callers that do not have a journey."""
    config = DecisionConfig()
    numbers = _costs(
        left=int((need_by - now).total_seconds()),
        wait_eta=current_eta_sec,
        backup_eta=backup_eta_sec,
        fare_increase=backup_fare_inr - current_fare_inr,
        fee=cancellation_fee_upper_bound_inr,
        band=risk_band,
        chat_label=chat_signal,
        config=config,
    )
    action = (
        DecisionType.REQUEST_APPROVAL
        if risk_band in {RiskBand.MEDIUM, RiskBand.HIGH} and _worth_switch(numbers, config)
        else DecisionType.SEARCH_BACKUP
    )
    return _deadline_event(numbers, action)
