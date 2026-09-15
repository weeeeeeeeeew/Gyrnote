from pydantic import SecretStr
import pytest

from src.app.core.config import settings
from src.app.services.embedding_runtime import (
    resolve_embedding_request,
    resolve_embedding_runtime,
    normalize_openai_compatible_base_url,
)
from src.app.services.llm_runtime import resolve_llm_runtime
from src.app.services.note_chunks import parse_dashscope_embeddings


def test_dashscope_root_maps_to_compatible_mode() -> None:
    assert (
        normalize_openai_compatible_base_url("https://dashscope.aliyuncs.com")
        == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    )
    post_url, protocol = resolve_embedding_request(
        "https://dashscope.aliyuncs.com",
        "qwen3.7-text-embedding-flash",
    )
    assert protocol == "openai"
    assert post_url == "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"


def test_dashscope_sdk_api_v1_root_uses_native_embedding_path() -> None:
    post_url, protocol = resolve_embedding_request(
        "https://dashscope.aliyuncs.com/api/v1",
        "qwen3.7-text-embedding-flash",
    )
    assert protocol == "dashscope"
    assert post_url.endswith("/api/v1/services/embeddings/text-embedding/text-embedding")


def test_qwen_client_key_defaults_to_china_compatible_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", False)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", None)
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "")
    runtime = resolve_embedding_runtime(
        {"api_key": "sk-embed", "model": "qwen3.7-text-embedding-flash"}
    )
    assert runtime.post_url == "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    assert runtime.protocol == "openai"
    assert runtime.dimensions == 1024
    assert runtime.batch_size == 20


def test_llm_dashscope_root_uses_compatible_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_ENABLED", True)
    monkeypatch.setattr(settings, "LLM_API_KEY", SecretStr("sk-chat"))
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://api.deepseek.com")
    monkeypatch.setattr(settings, "LLM_MODEL", "deepseek-v4-flash")
    _key, base_url, model = resolve_llm_runtime(
        {
            "api_key": "sk-chat",
            "base_url": "https://dashscope.aliyuncs.com",
            "model": "qwen-plus",
        }
    )
    assert base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert model == "qwen-plus"


def test_parse_dashscope_native_embeddings_orders_by_text_index() -> None:
    vectors = parse_dashscope_embeddings(
        {
            "status_code": 200,
            "output": {
                "embeddings": [
                    {"text_index": 1, "embedding": [0.2, 0.3]},
                    {"text_index": 0, "embedding": [0.0, 0.1]},
                ]
            },
        },
        expected_count=2,
    )
    assert vectors == [[0.0, 0.1], [0.2, 0.3]]
