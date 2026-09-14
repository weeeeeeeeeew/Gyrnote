from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.chunk_recalls import recall_note_chunks_endpoint
from src.app.schemas.chunk_recall import NoteChunkRecallRead, NoteChunkRecallRequest
from src.app.services.note_chunks import EmbeddingNotConfiguredError, EmbeddingProviderError


@pytest.mark.asyncio
async def test_chunk_recall_endpoint_returns_hits_when_ranker_ready(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = NoteChunkRecallRequest(query_embedding=[1.0, 0.0], k=3)
    expected = NoteChunkRecallRead(hits=[])
    monkeypatch.setattr(
        "src.app.api.v1.chunk_recalls.execute_chunk_recall",
        AsyncMock(return_value=expected),
    )
    result = await recall_note_chunks_endpoint(payload, current_user_dict, mock_db)
    assert result == expected


@pytest.mark.asyncio
async def test_chunk_recall_maps_value_error_to_400(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.chunk_recalls.execute_chunk_recall",
        AsyncMock(side_effect=ValueError("query embedding is zero")),
    )
    with pytest.raises(HTTPException) as error:
        await recall_note_chunks_endpoint(
            NoteChunkRecallRequest(query_embedding=[0.0], k=1),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_chunk_recall_maps_not_implemented_to_501(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.chunk_recalls.execute_chunk_recall",
        AsyncMock(side_effect=NotImplementedError("recall_note_chunks")),
    )
    with pytest.raises(HTTPException) as error:
        await recall_note_chunks_endpoint(
            NoteChunkRecallRequest(query_embedding=[1.0], k=1),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 501


def test_chunk_recall_request_requires_exactly_one_query() -> None:
    with pytest.raises(ValidationError, match="exactly one"):
        NoteChunkRecallRequest()
    with pytest.raises(ValidationError, match="exactly one"):
        NoteChunkRecallRequest(query="秋招", query_embedding=[1.0, 0.0])
    with pytest.raises(ValidationError, match="exactly one"):
        NoteChunkRecallRequest(query="   ")
    with pytest.raises(ValidationError):
        NoteChunkRecallRequest(thought_model={"nodes": []})  # extra=forbid
    assert NoteChunkRecallRequest(query=" 秋招方向 ").query == "秋招方向"
    assert NoteChunkRecallRequest(query_embedding=[1.0, 0.0]).query_embedding == [1.0, 0.0]


@pytest.mark.asyncio
async def test_chunk_recall_query_text_embeds_before_ranker(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    embed = AsyncMock(return_value=[[1.0, 0.0]])
    expected = NoteChunkRecallRead(hits=[])
    execute = AsyncMock(return_value=expected)
    monkeypatch.setattr("src.app.api.v1.chunk_recalls.embed_note_texts", embed)
    monkeypatch.setattr("src.app.api.v1.chunk_recalls.execute_chunk_recall", execute)

    result = await recall_note_chunks_endpoint(
        NoteChunkRecallRequest(query="秋招方向"),
        current_user_dict,
        mock_db,
    )

    assert result == expected
    embed.assert_awaited_once_with(["秋招方向"])
    execute.assert_awaited_once()
    assert execute.await_args.kwargs["query_embedding"] == [1.0, 0.0]
    assert execute.await_args.kwargs["owner_id"] == current_user_dict["id"]


@pytest.mark.asyncio
async def test_chunk_recall_query_maps_missing_embeddings_to_503(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.chunk_recalls.embed_note_texts",
        AsyncMock(side_effect=EmbeddingNotConfiguredError("note embeddings are disabled")),
    )
    with pytest.raises(HTTPException) as error:
        await recall_note_chunks_endpoint(
            NoteChunkRecallRequest(query="秋招方向"),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_chunk_recall_query_maps_provider_error_to_502(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.chunk_recalls.embed_note_texts",
        AsyncMock(side_effect=EmbeddingProviderError("provider down")),
    )
    with pytest.raises(HTTPException) as error:
        await recall_note_chunks_endpoint(
            NoteChunkRecallRequest(query="秋招方向"),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 502
