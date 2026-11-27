"""Filter and score backup offers using fictional provider profiles."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.intelligence.config import DecisionConfig
from app.schemas.domain import Quote
from app.schemas.enums import Provider
from app.schemas.requests import RecoveryPolicy
from app.simulation.profiles import ProviderProfile


@dataclass(frozen=True)
class RankedBackups:
    quotes: list[Quote]
    why_selected: str | None = None


def rank_backups(
    quotes: Sequence[Quote],
    *,
    now: datetime,
    policy: RecoveryPolicy,
    excluding_provider: Provider | None,
    attempted_providers: set[Provider],
    provider_cooldowns: Mapping[Provider, datetime],
    profiles: Mapping[Provider, ProviderProfile],
    config: DecisionConfig,
) -> RankedBackups:
    eligible = [
        quote
        for quote in quotes
        if quote.provider != excluding_provider
        and quote.estimated_fare_inr <= policy.max_total_fare_inr
        and quote.expires_at > now
        and (policy.allow_same_provider_retry or quote.provider not in attempted_providers)
        and (
            quote.provider not in provider_cooldowns
            or (now - provider_cooldowns[quote.provider]).total_seconds() >= config.provider_cooldown_seconds
        )
    ]
    if not eligible:
        return RankedBackups([])

    max_eta = max(quote.pickup_eta_sec for quote in eligible) or 1
    max_fare = max(quote.estimated_fare_inr for quote in eligible) or 1

    def simulator_prior(quote: Quote) -> float:
        profile = profiles[quote.provider]
        return profile.p_confirm_fail + profile.p_confirm_unknown

    def score(quote: Quote) -> float:
        return (
            config.backup_eta_weight * quote.pickup_eta_sec / max_eta
            + config.backup_fare_weight * quote.estimated_fare_inr / max_fare
            + config.backup_simulator_prior_weight * simulator_prior(quote)
        )

    ranked = sorted(eligible, key=lambda quote: (score(quote), quote.provider.value, quote.quote_id))
    top = ranked[0]
    return RankedBackups(
        ranked,
        f"{top.provider.value} ranks first at {score(top):.3f} points: "
        f"pickup ETA {top.pickup_eta_sec} s, fare INR {top.estimated_fare_inr}, "
        f"simulator_prior {simulator_prior(top):.3f} from fictional confirmation outcomes.",
    )
