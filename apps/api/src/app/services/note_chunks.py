"""Index note-body chunks for retrieval. HTTP embedding stays outside the DB transaction."""

from __future__ import annotations

import math
import uuid as uuid_pkg
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from ..core.config import settings
from .embedding_runtime import EmbeddingNotConfiguredError, EmbeddingRuntime, resolve_embedding_runtime
from ..models.note import NoteChunk
from .note_blocks import NoteBlock, extract_note_blocks

EmbedTexts = Callable[[list[str]], Awaitable[list[list[float]]]]


class EmbeddingError(Exception):
    pass


class EmbeddingProviderError(EmbeddingError):
    pass


class EmbeddingResponseInvalidError(EmbeddingError):
    pass


class NoteChunkDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    embedding: list[float] = Field(min_length=1)


def parse_openai_embeddings(payload: object, expected_count: int) -> list[list[float]]:
    """Parse an OpenAI-compatible embeddings envelope into vectors aligned to input order.

    Inputs: JSON object with data[].index and data[].embedding; expected_count >= 1.
    Output: expected_count vectors in input order.
    Fail closed with EmbeddingResponseInvalidError when the envelope, count, index, or vector is invalid.
    """
    if expected_count < 1:
        raise EmbeddingResponseInvalidError("embeddings expected_count is invalid")
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise EmbeddingResponseInvalidError("embeddings envelope is invalid")
    rows = payload["data"]
    if len(rows) != expected_count:
        raise EmbeddingResponseInvalidError("embeddings count does not match inputs")

    by_index: dict[int, list[float]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise EmbeddingResponseInvalidError("embeddings row is invalid")
        index = _coerce_embedding_index(row.get("index"), position=len(by_index), expected_count=expected_count)
        vector = row.get("embedding")
        if index in by_index:
            raise EmbeddingResponseInvalidError("embeddings index is duplicated")
        try:
            parsed = _require_vector(vector)
        except ValueError as exc:
            raise EmbeddingResponseInvalidError("embeddings vector is invalid") from exc
        by_index[index] = parsed

    if len(by_index) != expected_count:
        raise EmbeddingResponseInvalidError("embeddings indexes are incomplete")

    ordered = [by_index[index] for index in range(expected_count)]
    dim = len(ordered[0])
    if any(len(vector) != dim for vector in ordered):
        raise EmbeddingResponseInvalidError("embeddings dimensions do not match")
    return ordered


def parse_dashscope_embeddings(payload: object, expected_count: int) -> list[list[float]]:
    """Parse a DashScope native embedding envelope into vectors aligned to input order."""
    if expected_count < 1:
        raise EmbeddingResponseInvalidError("embeddings expected_count is invalid")
    if not isinstance(payload, dict):
        raise EmbeddingResponseInvalidError("embeddings envelope is invalid")
    status_code = payload.get("status_code")
    if isinstance(status_code, int) and status_code >= 400:
        raise EmbeddingProviderError(f"embedding provider returned HTTP {status_code}")
    output = payload.get("output")
    if not isinstance(output, dict) or not isinstance(output.get("embeddings"), list):
        raise EmbeddingResponseInvalidError("embeddings envelope is invalid")
    rows = output["embeddings"]
    if len(rows) != expected_count:
        raise EmbeddingResponseInvalidError("embeddings count does not match inputs")

    by_index: dict[int, list[float]] = {}
    for position, row in enumerate(rows):
        if not isinstance(row, dict):
            raise EmbeddingResponseInvalidError("embeddings row is invalid")
        index = _coerce_embedding_index(row.get("text_index", position), position=position, expected_count=expected_count)
        if index in by_index:
            raise EmbeddingResponseInvalidError("embeddings index is duplicated")
        try:
            parsed = _require_vector(row.get("embedding"))
        except ValueError as exc:
            raise EmbeddingResponseInvalidError("embeddings vector is invalid") from exc
        by_index[index] = parsed

    if len(by_index) != expected_count:
        raise EmbeddingResponseInvalidError("embeddings indexes are incomplete")
    ordered = [by_index[index] for index in range(expected_count)]
    dim = len(ordered[0])
    if any(len(vector) != dim for vector in ordered):
        raise EmbeddingResponseInvalidError("embeddings dimensions do not match")
    return ordered


def _embedding_request_body(runtime: EmbeddingRuntime, texts: list[str]) -> dict[str, Any]:
    if runtime.protocol == "dashscope":
        parameters: dict[str, Any] = {"text_type": "document", "output_type": "dense"}
        if runtime.dimensions is not None:
            parameters["dimension"] = runtime.dimensions
        return {
            "model": runtime.model,
            "input": {"texts": texts},
            "parameters": parameters,
        }
    body: dict[str, Any] = {"model": runtime.model, "input": texts, "encoding_format": "float"}
    if runtime.dimensions is not None:
        body["dimensions"] = runtime.dimensions
    return body


async def _post_embedding_batch(runtime: EmbeddingRuntime, texts: list[str]) -> list[list[float]]:
    headers = {
        "Authorization": f"Bearer {runtime.api_key}",
        "Content-Type": "application/json",
    }
    body = _embedding_request_body(runtime, texts)
    try:
        async with httpx.AsyncClient(timeout=settings.EMBEDDING_TIMEOUT_SECONDS) as client:
            response = await client.post(runtime.post_url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise EmbeddingProviderError(
            f"embedding request timed out after {settings.EMBEDDING_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.HTTPError as exc:
        raise EmbeddingProviderError(f"embedding request failed ({type(exc).__name__})") from exc

    if response.status_code >= 400:
        raise EmbeddingProviderError(f"embedding provider returned HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise EmbeddingResponseInvalidError("embedding response is not JSON") from exc
    try:
        if runtime.protocol == "dashscope":
            return parse_dashscope_embeddings(payload, expected_count=len(texts))
        return parse_openai_embeddings(payload, expected_count=len(texts))
    except EmbeddingResponseInvalidError:
        if len(texts) == 1:
            raise
        # DashScope/Qwen may 200 a batch then return fewer rows. Query-of-one still works.
        vectors: list[list[float]] = []
        for text in texts:
            vectors.extend(await _post_embedding_batch(runtime, [text]))
        return vectors


async def embed_note_texts(
    texts: list[str],
    override: dict[str, Any] | None = None,
) -> list[list[float]]:
    if not texts:
        return []
    runtime = resolve_embedding_runtime(override)
    vectors: list[list[float]] = []
    batch_size = max(1, runtime.batch_size)
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        vectors.extend(await _post_embedding_batch(runtime, batch))
    if len(vectors) != len(texts):
        raise EmbeddingResponseInvalidError("embeddings count does not match inputs")
    return vectors


def create_chunk_models(
    note_version_id: uuid_pkg.UUID,
    drafts: Sequence[NoteChunkDraft],
) -> list[NoteChunk]:
    return [
        NoteChunk(
            note_version_id=note_version_id,
            block_id=draft.block_id,
            text=draft.text,
            embedding=list(draft.embedding),
        )
        for draft in drafts
    ]


async def prepare_note_chunks(
    content_json: dict[str, Any],
    *,
    embed_texts: EmbedTexts | None = None,
    fail_closed: bool = False,
) -> list[NoteChunkDraft]:
    blocks = extract_note_blocks(content_json)
    if not blocks:
        return []
    embed = embed_texts or embed_note_texts
    try:
        vectors = await embed([block.text for block in blocks])
    except (EmbeddingNotConfiguredError, EmbeddingError, ValueError):
        if fail_closed:
            raise
        return []
    try:
        return pair_blocks_with_embeddings(blocks, vectors)
    except ValueError:
        if fail_closed:
            raise
        return []


def pair_blocks_with_embeddings(blocks: Sequence[NoteBlock], vectors: Sequence[list[float]]) -> list[NoteChunkDraft]:
    if len(blocks) != len(vectors):
        raise ValueError("embedding count does not match note blocks")
    drafts: list[NoteChunkDraft] = []
    expected_dim: int | None = None
    for block, vector in zip(blocks, vectors, strict=True):
        parsed = _require_vector(vector)
        if all(item == 0 for item in parsed):
            continue
        dim = len(parsed)
        if expected_dim is None:
            expected_dim = dim
        elif dim != expected_dim:
            raise ValueError("embedding dimensions do not match")
        drafts.append(NoteChunkDraft(block_id=block.id, text=block.text, embedding=parsed))
    return drafts


def _coerce_embedding_index(raw: object, *, position: int, expected_count: int) -> int:
    if raw is None:
        return position
    if isinstance(raw, str) and raw.isdigit():
        raw = int(raw)
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0 or raw >= expected_count:
        raise EmbeddingResponseInvalidError("embeddings index is invalid")
    return raw


def _require_vector(vector: object) -> list[float]:
    if not isinstance(vector, list) or not vector:
        raise ValueError("embedding vector is invalid")
    parsed: list[float] = []
    for item in vector:
        if isinstance(item, bool) or not isinstance(item, int | float):
            raise ValueError("embedding vector is invalid")
        value = float(item)
        if not math.isfinite(value):
            raise ValueError("embedding vector is invalid")
        parsed.append(value)
    return parsed
