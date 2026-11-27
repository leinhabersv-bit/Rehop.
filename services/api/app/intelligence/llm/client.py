"""Validated OpenAI-compatible JSON requests with a process-local LRU."""

import hashlib
import logging
import math
import os
from collections import OrderedDict
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from threading import Lock
from typing import TypeVar, cast

import httpx
from pydantic import BaseModel, ValidationError

Reply = TypeVar("Reply", bound=BaseModel)
_CACHE_SIZE = 512
_CACHE: OrderedDict[tuple[tuple[type[BaseModel], str, str], str, str], BaseModel] = OrderedDict()
_LOCK = Lock()
_LOG = logging.getLogger(__name__)


@dataclass
class CompletionTrace:
    reason: str = "not_attempted"
    post: Callable[..., httpx.Response] | None = None


_TRACE: ContextVar[CompletionTrace | None] = ContextVar("llm_completion_trace", default=None)


@contextmanager
def trace_completion(*, post: Callable[..., httpx.Response] | None = None) -> Iterator[CompletionTrace]:
    """Expose outcomes and an optional transport for offline tooling."""
    trace = CompletionTrace(post=post)
    token = _TRACE.set(trace)
    try:
        yield trace
    finally:
        _TRACE.reset(token)


def note_completion(reason: str) -> None:
    if (trace := _TRACE.get()) is not None:
        trace.reason = reason


def has_api_key() -> bool:
    return bool(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))


def model_name() -> str:
    return os.getenv("LLM_MODEL") or "gpt-4o-mini"


def complete_json(system: str, user: str, schema_model: type[Reply]) -> Reply | None:
    key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        note_completion("no_api_key")
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
            note_completion("cache_hit")
            return cast(Reply, cached.model_copy(deep=True))

    try:
        timeout = float(os.getenv("LLM_TIMEOUT_S", "4"))
    except ValueError:
        timeout = 0
    if not math.isfinite(timeout) or timeout <= 0:
        note_completion("invalid_timeout")
        return None

    trace = _TRACE.get()
    post = trace.post if trace is not None and trace.post is not None else httpx.post
    try:
        response = post(
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
            note_completion("schema_error")
            return None
        reply = schema_model.model_validate_json(content, context={"user_text": user})
    except httpx.HTTPStatusError as error:
        note_completion(f"http_{error.response.status_code}")
        return None
    except httpx.TimeoutException:
        note_completion("timeout")
        return None
    except (httpx.HTTPError, httpx.InvalidURL):
        # Never write credentials, provider responses, or any user text to logs.
        _LOG.debug("LLM transport unavailable")
        note_completion("transport_error")
        return None
    except ValidationError as error:
        types = {item["type"] for item in error.errors(include_input=False, include_context=False)}
        if "evidence_not_substring" in types:
            note_completion("evidence_not_substring")
        else:
            note_completion("invalid_json" if "json_invalid" in types else "schema_error")
        return None
    except ValueError:
        note_completion("invalid_json")
        return None
    except (KeyError, TypeError, IndexError):
        note_completion("schema_error")
        return None

    with _LOCK:
        _CACHE[cache_key] = reply.model_copy(deep=True)
        _CACHE.move_to_end(cache_key)
        if len(_CACHE) > _CACHE_SIZE:
            _CACHE.popitem(last=False)
    note_completion("llm_answer")
    return reply
