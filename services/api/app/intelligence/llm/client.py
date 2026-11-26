"""Validated OpenAI-compatible JSON requests with a process-local LRU."""

import hashlib
import logging
import math
import os
from collections import OrderedDict
from threading import Lock
from typing import TypeVar, cast

import httpx
from pydantic import BaseModel

Reply = TypeVar("Reply", bound=BaseModel)
_CACHE_SIZE = 512
_CACHE: OrderedDict[tuple[tuple[type[BaseModel], str, str], str, str], BaseModel] = OrderedDict()
_LOCK = Lock()
_LOG = logging.getLogger(__name__)


def has_api_key() -> bool:
    return bool(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))


def model_name() -> str:
    return os.getenv("LLM_MODEL") or "gpt-4o-mini"


def complete_json(system: str, user: str, schema_model: type[Reply]) -> Reply | None:
    key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    base = (os.getenv("LLM_API_BASE") or "https://api.openai.com/v1").rstrip("/")
    model = model_name()
    # Include prompt context and API base in the task identity. Allowed locations
    # can differ between calls with the same text and response schema.
    task = (schema_model, hashlib.sha256(system.encode()).hexdigest(), base)
    cache_key = (task, model, hashlib.sha256(user.encode()).hexdigest())
    with _LOCK:
        if (cached := _CACHE.get(cache_key)) is not None:
            _CACHE.move_to_end(cache_key)
            return cast(Reply, cached.model_copy(deep=True))

    try:
        timeout = float(os.getenv("LLM_TIMEOUT_S", "4"))
        if not math.isfinite(timeout) or timeout <= 0:
            return None
        response = httpx.post(
            base + "/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            timeout=timeout,
            follow_redirects=False,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            return None
        reply = schema_model.model_validate_json(content, context={"user_text": user})
    except (httpx.HTTPError, httpx.InvalidURL, KeyError, ValueError, TypeError, IndexError):
        # Never write credentials, provider responses, or any user text to logs.
        _LOG.debug("LLM completion unavailable or invalid")
        return None

    with _LOCK:
        _CACHE[cache_key] = reply.model_copy(deep=True)
        _CACHE.move_to_end(cache_key)
        if len(_CACHE) > _CACHE_SIZE:
            _CACHE.popitem(last=False)
    return reply
