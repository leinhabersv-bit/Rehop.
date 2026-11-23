"""Select backup quote; selection itself has no side effects."""

from __future__ import annotations

from app.schemas.domain import Quote
from app.schemas.enums import Provider


def rank_backups(
    quotes: list[Quote],
    *,
    excluding_provider: Provider | None,
    max_fare_inr: int,
    attempted_providers: set[Provider] | None = None,
) -> list[Quote]:
    attempted = attempted_providers or set()
    eligible = [
        q
        for q in quotes
        if q.provider != excluding_provider
        and q.estimated_fare_inr <= max_fare_inr
        and q.provider not in attempted
    ]
    return sorted(eligible, key=lambda q: (q.pickup_eta_sec, q.estimated_fare_inr))
