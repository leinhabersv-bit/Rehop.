"""Deterministic rules for untrusted, multilingual simulator text."""

import re

from app.schemas.enums import ChatLabel

_INJECTION = re.compile(
    r"\b(?:ignore|disregard|override|forget)\b.{0,55}\b(?:instructions?|rules?|prompts?)\b"
    r"|\b(?:system prompt|developer message|label this|output only|return json|set label|jailbreak)\b"
    r"|\b(?:approve|execute|authorize|authorise)\b.{0,25}\b(?:cancel\w*|booking)\b"
    r"|(?:\[/?(?:system|assistant)\]|<\/?(?:system|assistant)>|(?:^|\n)\s*(?:system|assistant|developer):)",
    re.I | re.S,
)
_CANCEL = re.compile(
    r"\b(?:cancel kar(?: do|na|o)?|cancel it|you cancel|please cancel|cancel the ride|"
    r"cancel your (?:ride|booking)|cancel pannunga|cancel pannidu|ride cancel pannunga)\b"
)
_TRAFFIC = re.compile(r"\b(?:traffic|jam|stuck|delay(?:ed)?|slow traffic|road blocked|nerisal)\b")
_ARRIVING = re.compile(
    r"\b(?:arriving|coming|almost there|on my way|i(?:'m| am) (?:here|outside)|"
    r"(?:have )?arrived|aa raha|aa rahi|pahunch gaya|pahunch gayi|vandhuten|vanthuten|"
    r"varen|varren|varuven|vandhachu)\b"
)
_ACK = re.compile(r"(?:ok(?:ay)?|k|yes|no|hmm+|sure|fine|acha|seri|sari|maybe)[.!?… ]*")
_ETA = re.compile(r"(?<![\w+-])(\d{1,3}|das)\s*(?:minutes?|mins?)(?!\w)", re.I)


def looks_like_injection(text: str) -> bool:
    return bool(_INJECTION.search(text))


def eta_claim(text: str) -> int | None:
    matches = [10 if value.casefold() == "das" else int(value) for value in _ETA.findall(text)]
    return matches[0] if matches and len(set(matches)) == 1 and matches[0] <= 120 else None


def classify(text: str) -> tuple[ChatLabel, int | None, str, float]:
    low = text.casefold().strip()
    if not low or looks_like_injection(text):
        return ChatLabel.UNKNOWN, None, text[:60], 0.0
    # Explicit negation is ambiguous rather than evidence of a cancellation request.
    if re.search(r"\b(?:don.t|do not|never|mat) cancel\b|\bcancel mat\b", low):
        label = ChatLabel.UNKNOWN
    elif _CANCEL.search(low):
        label = ChatLabel.REQUEST_RIDER_CANCEL
    elif _TRAFFIC.search(low):
        label = ChatLabel.TRAFFIC_DELAY
    elif _ARRIVING.search(low) and not re.search(r"\b(?:not|never) coming\b", low):
        label = ChatLabel.ARRIVING
    elif _ACK.fullmatch(low) or not re.search(r"\w", low):
        label = ChatLabel.UNKNOWN
    else:
        label = ChatLabel.OTHER
    return label, eta_claim(text), text[:60], 0.35 if label is ChatLabel.UNKNOWN else 0.65


def mentioned_locations(text: str, allowed: list[str]) -> list[tuple[int, str, str | None]]:
    low = text.casefold()
    mentions = []
    for name in allowed:
        match = re.search(rf"(?<!\w){re.escape(name.casefold())}(?!\w)", low)
        if match:
            marker = re.search(r"\b(from|to)\s*$", low[: match.start()])
            mentions.append((match.start(), name, marker.group(1) if marker else None))
    return sorted(mentions)


def ride_fields(
    text: str, mentions: list[tuple[int, str, str | None]]
) -> tuple[str | None, str | None, int | None]:
    pickups = [name for _, name, role in mentions if role == "from"]
    dropoffs = [name for _, name, role in mentions if role == "to"]
    pickup = pickups[0] if len(pickups) == 1 else None
    dropoff = dropoffs[0] if len(dropoffs) == 1 else None
    if len(mentions) == 2 and not pickups and not dropoffs:
        pickup, dropoff = [name for _, name, _ in mentions]
    match = re.search(r"\b(?:in|within|next)\s+(\d{1,3})\s*(?:minutes?|mins?)\b", text.casefold())
    minutes = int(match.group(1)) if match else None
    return pickup, dropoff, minutes if minutes is not None and 5 <= minutes <= 120 else None
