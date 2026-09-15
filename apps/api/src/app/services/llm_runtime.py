"""Resolve LLM endpoint credentials without logging secrets."""

from __future__ import annotations

from typing import Any

from ..core.config import settings
from .embedding_runtime import normalize_openai_compatible_base_url


class LlmNotConfiguredError(Exception):
    pass


def llm_override_from_values(
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> dict[str, str] | None:
    override: dict[str, str] = {}
    if isinstance(api_key, str) and api_key.strip():
        override["api_key"] = api_key.strip()
    if isinstance(base_url, str) and base_url.strip():
        override["base_url"] = base_url.strip()
    if isinstance(model, str) and model.strip():
        override["model"] = model.strip()
    return override or None


def resolve_llm_runtime(override: dict[str, Any] | None = None) -> tuple[str, str, str]:
    if not settings.LLM_ENABLED:
        raise LlmNotConfiguredError("LLM compilation is disabled")

    data = override or {}
    raw_key = data.get("api_key")
    api_key = raw_key.strip() if isinstance(raw_key, str) else ""
    if not api_key:
        api_key = settings.LLM_API_KEY.get_secret_value() if settings.LLM_API_KEY is not None else ""
    if not api_key.strip():
        raise LlmNotConfiguredError("LLM_API_KEY is not configured")

    raw_base = data.get("base_url")
    base_url = raw_base.strip() if isinstance(raw_base, str) and raw_base.strip() else settings.LLM_BASE_URL
    raw_model = data.get("model")
    model = raw_model.strip() if isinstance(raw_model, str) and raw_model.strip() else settings.LLM_MODEL
    return api_key.strip(), normalize_openai_compatible_base_url(base_url), model
