"""Resolve embedding credentials and provider URLs without logging secrets.

Chat LLM and embeddings are separate providers. A browser override may enable
embeddings even when EMBEDDING_ENABLED is false.

DashScope/Qwen: the Python SDK posts to a native host; OpenAI-compatible HTTP
uses ``.../compatible-mode/v1/embeddings``. Bare ``https://dashscope.aliyuncs.com``
is not a valid OpenAI embeddings root.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse

from ..core.config import settings

DASHSCOPE_CHINA_COMPAT = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_NATIVE_EMBED_PATH = "/services/embeddings/text-embedding/text-embedding"

EmbeddingProtocol = Literal["openai", "dashscope"]


class EmbeddingNotConfiguredError(Exception):
    pass


@dataclass(frozen=True)
class EmbeddingRuntime:
    api_key: str
    post_url: str
    model: str
    protocol: EmbeddingProtocol
    dimensions: int | None
    batch_size: int


def looks_like_qwen_embedding_model(model: str) -> bool:
    name = model.strip().lower()
    return name.startswith("qwen") or name.startswith("text-embedding-v")


def _dashscope_host(netloc: str) -> bool:
    host = netloc.lower()
    return (
        host == "dashscope.aliyuncs.com"
        or host.endswith(".dashscope.aliyuncs.com")
        or "dashscope-intl.aliyuncs.com" in host
        or host.endswith(".maas.aliyuncs.com")
    )


def _strip_openai_leaf(url: str) -> str:
    raw = url.strip().rstrip("/")
    lowered = raw.lower()
    if lowered.endswith("/chat/completions"):
        return raw[: -len("/chat/completions")].rstrip("/")
    if lowered.endswith("/embeddings") and "text-embedding/text-embedding" not in lowered:
        return raw[: -len("/embeddings")].rstrip("/")
    return raw


def normalize_openai_compatible_base_url(base_url: str) -> str:
    """Map DashScope console/SDK roots onto compatible-mode/v1. Leave other hosts unchanged."""
    raw = _strip_openai_leaf(base_url)
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return raw
    if not _dashscope_host(parsed.netloc):
        return raw
    path = parsed.path.rstrip("/")
    if "compatible-mode" in path:
        return f"{parsed.scheme}://{parsed.netloc}{path}"
    return f"{parsed.scheme}://{parsed.netloc}/compatible-mode/v1"


def resolve_embedding_request(base_url: str, model: str) -> tuple[str, EmbeddingProtocol]:
    raw = _strip_openai_leaf(base_url)
    parsed = urlparse(raw)
    path = parsed.path.rstrip("/")
    if "text-embedding/text-embedding" in path:
        return raw, "dashscope"
    if _dashscope_host(parsed.netloc) and path.endswith("/api/v1"):
        return f"{parsed.scheme}://{parsed.netloc}{path}{DASHSCOPE_NATIVE_EMBED_PATH}", "dashscope"
    compat = normalize_openai_compatible_base_url(raw)
    return f"{compat}/embeddings", "openai"


def _dimensions_for_model(model: str) -> int | None:
    if looks_like_qwen_embedding_model(model):
        return 1024
    return None


def _batch_size_for(protocol: EmbeddingProtocol, model: str) -> int:
    name = model.strip().lower()
    if protocol == "dashscope" or looks_like_qwen_embedding_model(model):
        if name.startswith("text-embedding-v"):
            return 10
        return 20
    return 64


def embedding_override_from_values(
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


def resolve_embedding_runtime(override: dict[str, Any] | None = None) -> EmbeddingRuntime:
    data = override or {}
    raw_key = data.get("api_key")
    client_key = raw_key.strip() if isinstance(raw_key, str) else ""
    raw_base = data.get("base_url")
    client_base = raw_base.strip() if isinstance(raw_base, str) else ""
    raw_model = data.get("model")
    client_model = raw_model.strip() if isinstance(raw_model, str) else ""

    env_key = settings.EMBEDDING_API_KEY.get_secret_value() if settings.EMBEDDING_API_KEY is not None else ""
    env_base = settings.EMBEDDING_BASE_URL.strip()
    env_model = settings.EMBEDDING_MODEL.strip()

    if client_key:
        api_key = client_key
        model = client_model or env_model
        if client_base:
            base_url = client_base
        elif env_base:
            base_url = env_base
        elif looks_like_qwen_embedding_model(model):
            base_url = DASHSCOPE_CHINA_COMPAT
        else:
            base_url = ""
    elif settings.EMBEDDING_ENABLED:
        api_key = env_key
        base_url = env_base
        model = env_model
    else:
        raise EmbeddingNotConfiguredError("note embeddings are disabled")

    if not api_key.strip() or not base_url.strip():
        raise EmbeddingNotConfiguredError("EMBEDDING_BASE_URL or EMBEDDING_API_KEY is not configured")
    if not model.strip():
        raise EmbeddingNotConfiguredError("EMBEDDING_MODEL is not configured")

    post_url, protocol = resolve_embedding_request(base_url, model)
    return EmbeddingRuntime(
        api_key=api_key.strip(),
        post_url=post_url,
        model=model.strip(),
        protocol=protocol,
        dimensions=_dimensions_for_model(model),
        batch_size=_batch_size_for(protocol, model),
    )
