"""Note Q&A sits on dual-layer RAG. No hits => no LLM. Never writes ThoughtModel."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.app.schemas.graph_rag import GraphRagNodeHit, GraphRagPassageHit, GraphRagRead
from src.app.schemas.note_answer import NoteAnswerRequest
from src.app.services.note_answer import (
    build_note_answer_messages,
    execute_note_answer,
    parse_grounded_answer,
)


def test_note_answer_prompt_forbids_invention_and_graph_writes() -> None:
    messages = build_note_answer_messages(
        "T0 目标是什么",
        [
            GraphRagPassageHit(
                note_id="11111111-1111-1111-1111-111111111111",
                note_title="秋招投递计划",
                node_id="claim-t0",
                block_id="b-t0",
                text="T0 目标是字节跳动",
                score=0.91,
            )
        ],
    )
    joined = "\n".join(item["content"] for item in messages)
    assert "T0 目标是字节跳动" in joined
    assert "Do not invent" in joined
    assert "ThoughtModel" in joined
    assert "b-t0" in joined


def test_note_answer_prompt_includes_earlier_turns() -> None:
    from src.app.schemas.note_answer import NoteAnswerTurn

    messages = build_note_answer_messages(
        "那 T1 呢",
        [
            GraphRagPassageHit(
                note_id="11111111-1111-1111-1111-111111111111",
                note_title="秋招投递计划",
                node_id="claim-t1",
                block_id="b-t1",
                text="T1 是备选公司",
                score=0.8,
            )
        ],
        [NoteAnswerTurn(role="user", content="T0 目标是什么"), NoteAnswerTurn(role="assistant", content="T0 是字节")],
    )
    user = messages[1]["content"]
    assert "earlier turns" in user
    assert "T0 是字节" in user
    assert "那 T1 呢" in user


def test_parse_grounded_answer_drops_unknown_block_ids() -> None:
    answer, cited, grounded = parse_grounded_answer(
        {
            "answer": "T0 目标是字节跳动",
            "cited_block_ids": ["b-t0", "invented", "b-t0"],
            "grounded": True,
        },
        {"b-t0"},
    )
    assert answer == "T0 目标是字节跳动"
    assert cited == ["b-t0"]
    assert grounded is True


def test_parse_grounded_answer_ungrounded_without_valid_cites() -> None:
    _answer, cited, grounded = parse_grounded_answer(
        {"answer": "资料不足", "cited_block_ids": ["invented"], "grounded": True},
        {"b-t0"},
    )
    assert cited == []
    assert grounded is False


def test_note_answer_request_strips_query() -> None:
    assert NoteAnswerRequest(query=" T0 ").query == "T0"


@pytest.mark.asyncio
async def test_execute_note_answer_skips_llm_when_rag_is_empty(
    mock_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    chat = AsyncMock(return_value='{"answer":"不该出现","cited_block_ids":[],"grounded":true}')
    monkeypatch.setattr(
        "src.app.services.note_answer.execute_graph_rag",
        AsyncMock(
            return_value=GraphRagRead(
                nodes=[],
                hits=[],
                scoped_block_count=0,
                empty_reason="no_confirmed_nodes",
            )
        ),
    )
    result = await execute_note_answer(
        mock_db,
        owner_id=1,
        query="T0 目标是什么",
        query_embedding=[1.0, 0.0],
        k=5,
        chat_complete=chat,
    )
    assert result.grounded is False
    assert result.refuse_reason == "no_confirmed_nodes"
    assert "不能回答" in result.answer
    chat.assert_not_awaited()


@pytest.mark.asyncio
async def test_execute_note_answer_grounds_on_rag_passages(
    mock_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    hit = GraphRagPassageHit(
        note_id="11111111-1111-1111-1111-111111111111",
        note_title="秋招投递计划",
        node_id="claim-t0",
        block_id="b-t0",
        text="T0 目标是字节跳动",
        score=0.91,
    )
    node = GraphRagNodeHit(
        note_id=hit.note_id,
        note_title=hit.note_title,
        node_id="claim-t0",
        node_type="claim",
        node_text="T0 目标是字节跳动",
        score=0.88,
    )
    monkeypatch.setattr(
        "src.app.services.note_answer.execute_graph_rag",
        AsyncMock(return_value=GraphRagRead(nodes=[node], hits=[hit], scoped_block_count=1)),
    )
    chat = AsyncMock(
        return_value='{"answer":"T0 目标是字节跳动。","cited_block_ids":["b-t0"],"grounded":true}'
    )
    result = await execute_note_answer(
        mock_db,
        owner_id=1,
        query="T0 目标是什么",
        query_embedding=[1.0, 0.0],
        k=5,
        chat_complete=chat,
    )
    assert result.grounded is True
    assert result.cited_block_ids == ["b-t0"]
    assert result.hits[0].block_id == "b-t0"
    chat.assert_awaited_once()
    user = chat.await_args.args[0][1]["content"]
    assert "T0 目标是什么" in user
    assert "b-t0" in user
