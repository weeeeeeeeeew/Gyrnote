from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.note_answers import answer_note_question_endpoint
from src.app.schemas.note_answer import NoteAnswerRead, NoteAnswerRequest
from src.app.services.note_chunks import EmbeddingNotConfiguredError


@pytest.mark.asyncio
async def test_note_answer_endpoint_returns_grounded_read(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    expected = NoteAnswerRead(answer="T0 目标是字节跳动。", grounded=True, cited_block_ids=["b-t0"])
    execute = AsyncMock(return_value=expected)
    monkeypatch.setattr(
        "src.app.api.v1.note_answers.embed_note_texts",
        AsyncMock(return_value=[[1.0, 0.0]]),
    )
    monkeypatch.setattr("src.app.api.v1.note_answers.execute_note_answer", execute)
    result = await answer_note_question_endpoint(
        NoteAnswerRequest(query="T0 目标是什么"),
        current_user_dict,
        mock_db,
    )
    assert result == expected
    assert execute.await_args.kwargs["query"] == "T0 目标是什么"
    assert execute.await_args.kwargs["owner_id"] == current_user_dict["id"]


@pytest.mark.asyncio
async def test_note_answer_maps_missing_embeddings_to_503(
    mock_db, current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.note_answers.embed_note_texts",
        AsyncMock(side_effect=EmbeddingNotConfiguredError("note embeddings are disabled")),
    )
    with pytest.raises(HTTPException) as error:
        await answer_note_question_endpoint(
            NoteAnswerRequest(query="T0 目标是什么"),
            current_user_dict,
            mock_db,
        )
    assert error.value.status_code == 503


def test_note_answer_request_rejects_blank_query() -> None:
    with pytest.raises(ValidationError):
        NoteAnswerRequest(query="   ")
    with pytest.raises(ValidationError):
        NoteAnswerRequest(query="T0", thought_model={"nodes": []})  # extra=forbid
