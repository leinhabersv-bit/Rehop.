"""Select backup quote; selection itself has no side effects."""

from __future__ import annotations

from typing import Any


def rank_backups(
    quotes: list[dict[str, Any]],
    *,
    excluding_provider: str,
    max_fare_inr: int,
    attempted_providers: set[str] | None = None,
) -> list[dict[str, Any]]:
    attempted = attempted_providers or set()
    eligible = [
        q
        for q in quotes
        if q["provider"] != excluding_provider
        and q["estimated_fare_inr"] <= max_fare_inr
        and q["provider"] not in attempted
    ]
    return sorted(eligible, key=lambda q: (q["pickup_eta_sec"], q["estimated_fare_inr"]))
