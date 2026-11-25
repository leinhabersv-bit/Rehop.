"""Data-defined scripted pickups and the profile-driven RANDOM world."""

from dataclasses import dataclass, field
from typing import Literal

from app.schemas.enums import OpStatus, Provider
from app.simulation.profiles import BASE_OFFERS
from app.simulation.providers import ScenarioOverrides

InjectionKind = Literal[
    "FORCE_MODE",
    "DRIVER_CANCEL",
    "DRIVER_MESSAGE",
    "FORCE_CONFIRM_RESULT",
    "FORCE_CANCEL_RESULT",
    "BACKUP_UNAVAILABLE",
    "FARE_SURGE",
    "NEED_BY",
]


@dataclass(frozen=True)
class Injection:
    at_tick: int
    kind: InjectionKind
    params: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ScenarioScript:
    name: str
    profile_overrides: dict = field(default_factory=dict)
    injections: tuple[Injection, ...] = ()
    auto_rebook: bool = False
    fare_cap: int = 650
    auto_book: bool = True
    sampled: bool = False


STALL = Injection(1, "FORCE_MODE", {"mode": "STALLED", "ride_number": 1})
CANCEL = Injection(8, "DRIVER_CANCEL", {"ride_number": 1})

SCRIPTS = {
    "S01": ScenarioScript("Healthy pickup"),
    "S02": ScenarioScript(
        "Temporary traffic stop",
        injections=(Injection(3, "FORCE_MODE", {"mode": "STOPPED", "duration_ticks": 5, "ride_number": 1}),),
    ),
    "S03": ScenarioScript("Driver stalled, ETA increasing", injections=(STALL,)),
    "S04": ScenarioScript("Driver cancels", injections=(CANCEL,), auto_rebook=True),
    "S05": ScenarioScript(
        "Second driver also cancels",
        injections=(
            CANCEL,
            Injection(8, "DRIVER_CANCEL", {"ride_number": 2}),
        ),
        auto_rebook=True,
    ),
    "S06": ScenarioScript(
        "No available backup",
        injections=(
            Injection(0, "BACKUP_UNAVAILABLE", {"stage": "search"}),
            CANCEL,
        ),
        auto_rebook=True,
    ),
    "S07": ScenarioScript(
        "Backups exceed fare cap",
        injections=(
            Injection(
                0, "FARE_SURGE", {"providers": ["PROVIDER_B", "PROVIDER_C", "PROVIDER_D"], "amount": 120}
            ),
            CANCEL,
        ),
        auto_rebook=True,
        fare_cap=330,
    ),
    "S08": ScenarioScript(
        "Stale GPS updates", injections=(Injection(4, "FORCE_MODE", {"mode": "GPS_LOST", "ride_number": 1}),)
    ),
    "S09": ScenarioScript(
        "Near pickup, stationary", profile_overrides={"distance_m": 100}, injections=(STALL,)
    ),
    "S10": ScenarioScript("Arrival/cancellation race", profile_overrides={"distance_m": 900}),
    "S11": ScenarioScript("User cancels during recovery", injections=(STALL,)),
    "S12": ScenarioScript(
        "Booking status unknown",
        injections=(Injection(0, "FORCE_CONFIRM_RESULT", {"result": "UNKNOWN"}),),
        auto_book=False,
    ),
    "S13": ScenarioScript(
        "Driver chat requests rider cancellation",
        injections=(
            STALL,
            Injection(
                5, "DRIVER_MESSAGE", {"text": "Please cancel kar do, I am not coming.", "ride_number": 1}
            ),
        ),
    ),
    "S14": ScenarioScript(
        "Refreshed backup unavailable: original preserved",
        injections=(
            STALL,
            Injection(0, "BACKUP_UNAVAILABLE", {"stage": "refresh"}),
        ),
    ),
    "S15": ScenarioScript(
        "Quote lost after cancellation: disclose recovery gap",
        injections=(
            STALL,
            Injection(0, "FORCE_CONFIRM_RESULT", {"result": "FAILED", "stage": "replacement"}),
        ),
    ),
    "S16": ScenarioScript(
        "Urgent and relaxed pickup deadlines",
        injections=(
            STALL,
            Injection(0, "NEED_BY", {"minutes": 5}),
        ),
    ),
    "RANDOM": ScenarioScript("Randomized pickup", sampled=True, auto_book=False),
}
SCENARIOS = {key: script.name for key, script in SCRIPTS.items() if key != "RANDOM"}
RANDOM_SCENARIO = "RANDOM"


def script_for(scenario: str, profiled: bool = False) -> ScenarioScript:
    return SCRIPTS["RANDOM"] if profiled else SCRIPTS[scenario]


def provider_overrides(script: ScenarioScript) -> ScenarioOverrides:
    overrides = ScenarioOverrides(scripted=not script.sampled)
    if not script.sampled:
        overrides.quote_offers = dict(BASE_OFFERS)
    for injection in script.injections:
        if injection.at_tick != 0:
            continue
        params = injection.params
        if injection.kind == "FARE_SURGE":
            for provider in params["providers"]:
                fare, eta = overrides.quote_offers[Provider(provider)]
                overrides.quote_offers[Provider(provider)] = (fare + params["amount"], eta)
        if injection.kind == "FORCE_CONFIRM_RESULT" and params.get("stage") != "replacement":
            overrides.next_confirm = dict.fromkeys(Provider, OpStatus(params["result"]))
    return overrides
