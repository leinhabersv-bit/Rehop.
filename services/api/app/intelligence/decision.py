"""Explainable pickup-deadline cost comparison; recommendations only."""

from datetime import datetime

from app.schemas.domain import DeadlineDecision
from app.schemas.enums import ChatLabel, RiskBand


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
    left = max(0, int((need_by - now).total_seconds()))
    wait_late = max(0, current_eta_sec - left)
    switch_late = max(0, backup_eta_sec - left)
    # Illustrative simulated preference scores, never predicted monetary losses.
    wait_cost = wait_late * 2 + (
        90 if risk_band == RiskBand.HIGH else 40 if risk_band == RiskBand.MEDIUM else 0
    )
    switch_cost = (
        switch_late * 2 + max(0, backup_fare_inr - current_fare_inr) + cancellation_fee_upper_bound_inr
    )
    if chat_signal == ChatLabel.REQUEST_RIDER_CANCEL:
        wait_cost += 20  # advisory only; never sufficient to cancel a ride
    # Switching must offer a meaningful improvement and must be approved.
    recommend = (
        switch_cost + 30 < wait_cost
        and backup_eta_sec < current_eta_sec
        and risk_band in {RiskBand.MEDIUM, RiskBand.HIGH}
    )
    return DeadlineDecision(
        seconds_until_deadline=left,
        wait_late_sec=wait_late,
        switch_late_sec=switch_late,
        wait_cost_points=wait_cost,
        switch_cost_points=switch_cost,
        recommendation="PROPOSE_SWITCH" if recommend else "WAIT_AND_MONITOR",
        formula="simulated heuristic; not guaranteed pickup or real money cost",
    )
