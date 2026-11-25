"""Use a road estimate to set the length of destination playback."""

import math
import os
from datetime import timedelta

import httpx

from app.schemas.requests import Location


def destination_playback(pickup: Location, dropoff: Location) -> timedelta:
    endpoint = os.getenv("REHOP_ROUTE_ESTIMATE_URL")
    if endpoint:
        try:
            response = httpx.post(
                endpoint,
                json={
                    "from": f"{pickup.lng:.6f},{pickup.lat:.6f}",
                    "to": f"{dropoff.lng:.6f},{dropoff.lat:.6f}",
                    "source": "google-map",
                },
                timeout=4.0,
            )
            response.raise_for_status()
            seconds = response.json()["durationSeconds"]
            if type(seconds) in (int, float) and 0 <= seconds <= 7 * 24 * 3600:
                return timedelta(seconds=max(8, seconds / 20))
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            pass

    # Offline playback uses straight-line distance at 43.2 km/h. The map
    # never displays this fallback as a Google traffic estimate.
    return timedelta(seconds=max(8, straight_line_distance_m(pickup, dropoff) / 12 / 20))


def straight_line_distance_m(pickup: Location, dropoff: Location) -> float:
    lat1, lat2 = math.radians(pickup.lat), math.radians(dropoff.lat)
    delta_lng = math.radians(dropoff.lng - pickup.lng)
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(min(1.0, a)))
