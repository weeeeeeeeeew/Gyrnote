"""Parse and index note-body chunks. No live embedding provider."""

from __future__ import annotations

import uuid as uuid_pkg
from unittest.mock import patch

import pytest
from pydantic import SecretStr

from src.app.core.config import settings
from src.app.services.note_blocks import NoteBlock
from src.app.services.note_chunks import (
    EmbeddingNotConfiguredError,
    EmbeddingProviderError,
    EmbeddingResponseInvalidError,
    create_chunk_models,
    embed_note_texts,
    pair_blocks_with_embeddings,
    parse_openai_embeddings,
    prepare_note_chunks,
)

DOC_WITH_BLOCK = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "attrs": {"blockId": "block-a"},
            "content": [{"type": "text", "text": "有内容"}],
        }
    ],
}


def test_parse_openai_embeddings_orders_by_index() -> None:
    vectors = parse_openai_embeddings(
        {
            "data": [
                {"index": 1, "embedding": [0.0, 1.0]},
                {"index": 0, "embedding": [1.0, 0.0]},
            ]
        },
        expected_count=2,
    )
    assert vectors == [[1.0, 0.0], [0.0, 1.0]]


def test_parse_openai_embeddings_accepts_missing_index() -> None:
    vectors = parse_openai_embeddings(
        {"data": [{"embedding": [1.0, 0.0]}, {"embedding": [0.0, 1.0]}]},
        expected_count=2,
    )
    assert vectors == [[1.0, 0.0], [0.0, 1.0]]


@pytest.mark.parametrize(
    ("payload", "expected_count"),
    [
        (None, 1),
        ({"data": "nope"}, 1),
        ({"data": [{"index": 0, "embedding": [1.0]}, {"index": 0, "embedding": [0.0, 1.0]}]}, 2),
        ({"data": [{"index": 2, "embedding": [1.0]}, {"index": 0, "embedding": [0.0, 1.0]}]}, 2),
        ({"data": [{"index": True, "embedding": [1.0]}]}, 1),
        ({"data": [{"index": 0, "embedding": []}]}, 1),
        ({"data": [{"index": 0, "embedding": [True, 1.0]}]}, 1),
        ({"data": [{"index": 0, "embedding": [float("nan")]}]}, 1),
        (
            {
                "data": [
                    {"index": 0, "embedding": [1.0]},
                    {"index": 1, "embedding": [1.0, 0.0]},
                ]
            },
            2,
        ),
    ],
)
def test_parse_openai_embeddings_fail_closed(payload: object, expected_count: int) -> None:
    with pytest.raises(EmbeddingResponseInvalidError):
        parse_openai_embeddings(payload, expected_count=expected_count)


def test_parse_openai_embeddings_rejects_count_mismatch() -> None:
    with pytest.raises(EmbeddingResponseInvalidError, match="count"):
        parse_openai_embeddings({"data": [{"index": 0, "embedding": [1.0]}]}, expected_count=2)


def test_pair_blocks_skips_zero_vectors_and_keeps_order() -> None:
    drafts = pair_blocks_with_embeddings(
        [
            NoteBlock(id="block-a", text="有内容"),
            NoteBlock(id="block-b", text="零向量"),
            NoteBlock(id="block-c", text="后续"),
        ],
        [[1.0, 0.0], [0.0, 0.0], [0.0, 1.0]],
    )
    assert [(draft.block_id, draft.embedding) for draft in drafts] == [
        ("block-a", [1.0, 0.0]),
        ("block-c", [0.0, 1.0]),
    ]


def test_pair_blocks_rejects_count_and_dim_mismatch() -> None:
    blocks = [NoteBlock(id="block-a", text="有内容")]
    with pytest.raises(ValueError, match="count"):
        pair_blocks_with_embeddings(blocks, [[1.0], [0.0]])
    with pytest.raises(ValueError, match="dimensions"):
        pair_blocks_with_embeddings(
            [NoteBlock(id="a", text="a"), NoteBlock(id="b", text="b")],
            [[1.0], [1.0, 0.0]],
        )


def test_create_chunk_models_copies_drafts() -> None:
    version_id = uuid_pkg.uuid4()
    drafts = pair_blocks_with_embeddings(
        [NoteBlock(id="block-a", text="有内容")],
        [[0.25, 0.75]],
    )
    chunks = create_chunk_models(version_id, drafts)
    assert len(chunks) == 1
    assert chunks[0].note_version_id == version_id
    assert chunks[0].block_id == "block-a"
    assert chunks[0].text == "有内容"
    assert chunks[0].embedding == [0.25, 0.75]


@pytest.mark.asyncio
async def test_prepare_note_chunks_returns_empty_without_blocks() -> None:
    drafts = await prepare_note_chunks({"type": "doc", "content": [{"type": "paragraph"}]})
    assert drafts == []


@pytest.mark.asyncio
async def test_prepare_note_chunks_uses_injected_embed() -> None:
    async def fake_embed(texts: list[str]) -> list[list[float]]:
        assert texts == ["有内容"]
        return [[1.0, 0.0]]

    drafts = await prepare_note_chunks(DOC_WITH_BLOCK, embed_texts=fake_embed)
    assert drafts[0].block_id == "block-a"
    assert drafts[0].embedding == [1.0, 0.0]


@pytest.mark.asyncio
async def test_prepare_note_chunks_swallows_embedding_errors() -> None:
    async def fail_embed(_texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("provider down")

    drafts = await prepare_note_chunks(DOC_WITH_BLOCK, embed_texts=fail_embed)
    assert drafts == []


@pytest.mark.asyncio
async def test_prepare_note_chunks_fail_closed_raises() -> None:
    async def fail_embed(_texts: list[str]) -> list[list[float]]:
        raise EmbeddingProviderError("provider down")

    with pytest.raises(EmbeddingProviderError):
        await prepare_note_chunks(DOC_WITH_BLOCK, embed_texts=fail_embed, fail_closed=True)


@pytest.mark.asyncio
async def test_embed_note_texts_requires_separate_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", False)
    with pytest.raises(EmbeddingNotConfiguredError):
        await embed_note_texts(["有内容"])

    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", True)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", SecretStr("sk-test"))
    with pytest.raises(EmbeddingNotConfiguredError):
        await embed_note_texts(["有内容"])


@pytest.mark.asyncio
async def test_embed_note_texts_posts_openai_compatible_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", True)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", SecretStr("sk-test"))
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")

    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"data": [{"index": 0, "embedding": [0.1, 0.2]}]}

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(
            self,
            url: str,
            headers: dict[str, str] | None = None,
            json: dict[str, object] | None = None,
        ) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            assert headers is not None
            assert headers["Authorization"].startswith("Bearer ")
            return FakeResponse()

    with patch("src.app.services.note_chunks.httpx.AsyncClient", FakeClient):
        vectors = await embed_note_texts(["有内容"])

    assert captured["url"] == "https://example.test/v1/embeddings"
    assert captured["json"] == {
        "model": "text-embedding-3-small",
        "input": ["有内容"],
        "encoding_format": "float",
    }
    assert captured["timeout"] == settings.EMBEDDING_TIMEOUT_SECONDS
    assert vectors == [[0.1, 0.2]]


@pytest.mark.asyncio
async def test_embed_note_texts_uses_client_override_when_env_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", False)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", None)
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")

    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"data": [{"index": 0, "embedding": [0.3, 0.4]}]}

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(
            self,
            url: str,
            headers: dict[str, str] | None = None,
            json: dict[str, object] | None = None,
        ) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    with patch("src.app.services.note_chunks.httpx.AsyncClient", FakeClient):
        vectors = await embed_note_texts(
            ["有内容"],
            {"api_key": "sk-embed", "base_url": "https://embed.example/v1", "model": "bge-m3"},
        )

    assert captured["url"] == "https://embed.example/v1/embeddings"
    assert captured["json"] == {"model": "bge-m3", "input": ["有内容"], "encoding_format": "float"}
    assert vectors == [[0.3, 0.4]]


@pytest.mark.asyncio
async def test_embed_note_texts_defaults_qwen_to_dashscope_compatible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", False)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", None)
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "")
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"data": [{"index": 0, "embedding": [0.5, 0.6]}]}

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(
            self,
            url: str,
            headers: dict[str, str] | None = None,
            json: dict[str, object] | None = None,
        ) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    with patch("src.app.services.note_chunks.httpx.AsyncClient", FakeClient):
        vectors = await embed_note_texts(
            ["衣服的质量杠杠的"],
            {"api_key": "sk-embed", "model": "qwen3.7-text-embedding-flash"},
        )

    assert captured["url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    assert captured["json"] == {
        "model": "qwen3.7-text-embedding-flash",
        "input": ["衣服的质量杠杠的"],
        "encoding_format": "float",
        "dimensions": 1024,
    }
    assert vectors == [[0.5, 0.6]]


@pytest.mark.asyncio
async def test_embed_note_texts_posts_dashscope_native_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", False)
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, object]:
            return {"status_code": 200, "output": {"embeddings": [{"text_index": 0, "embedding": [0.7, 0.8]}]}}

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(
            self,
            url: str,
            headers: dict[str, str] | None = None,
            json: dict[str, object] | None = None,
        ) -> FakeResponse:
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    with patch("src.app.services.note_chunks.httpx.AsyncClient", FakeClient):
        vectors = await embed_note_texts(
            ["有内容"],
            {
                "api_key": "sk-embed",
                "base_url": "https://dashscope.aliyuncs.com/api/v1",
                "model": "qwen3.7-text-embedding-flash",
            },
        )

    assert captured["url"] == (
        "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
    )
    assert captured["json"] == {
        "model": "qwen3.7-text-embedding-flash",
        "input": {"texts": ["有内容"]},
        "parameters": {"text_type": "document", "output_type": "dense", "dimension": 1024},
    }
    assert vectors == [[0.7, 0.8]]


@pytest.mark.asyncio
async def test_embed_note_texts_retries_batch_as_singles_on_count_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMBEDDING_ENABLED", True)
    monkeypatch.setattr(settings, "EMBEDDING_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(settings, "EMBEDDING_API_KEY", SecretStr("sk-test"))
    monkeypatch.setattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
    posted: list[list[str]] = []

    class FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self.status_code = 200
            self._payload = payload

        def json(self) -> dict[str, object]:
            return self._payload

    class FakeClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(
            self,
            url: str,
            headers: dict[str, str] | None = None,
            json: dict[str, object] | None = None,
        ) -> FakeResponse:
            texts = list(json["input"]) if json and isinstance(json.get("input"), list) else []
            posted.append(texts)
            if len(texts) > 1:
                return FakeResponse({"data": [{"index": 0, "embedding": [0.1, 0.2]}]})
            return FakeResponse({"data": [{"index": 0, "embedding": [0.3, 0.4]}]})

    with patch("src.app.services.note_chunks.httpx.AsyncClient", FakeClient):
        vectors = await embed_note_texts(["第一段", "第二段"])

    assert posted[0] == ["第一段", "第二段"]
    assert posted[1:] == [["第一段"], ["第二段"]]
    assert vectors == [[0.3, 0.4], [0.3, 0.4]]
