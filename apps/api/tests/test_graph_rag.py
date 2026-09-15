"""Dual-layer RAG: rank confirmed node summaries, then recall only their anchored blocks."""

from __future__ import annotations

import uuid as uuid_pkg
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from src.app.schemas.chunk_recall import NoteChunkHit
from src.app.schemas.note import PersistedThoughtEdge, PersistedThoughtModel, PersistedThoughtNode
from src.app.services.chunk_recall import build_note_chunk_recall_statement, match_lexical_note_blocks
from src.app.services.graph_rag import (
    AnchorRef,
    GraphRagSnapshot,
    collect_block_ids,
    cosine_similarity,
    execute_graph_rag,
    expand_one_hop,
    merge_ranked_with_lexical,
    rank_nodes_for_query,
)


NOTE_ID = uuid_pkg.UUID("11111111-1111-1111-1111-111111111111")
ANCHOR_T0 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ANCHOR_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def _node(
    node_id: str,
    text: str,
    *,
    review_status: str = "confirmed",
    source_anchor_ids: list[str] | None = None,
    node_type: str = "claim",
) -> PersistedThoughtNode:
    return PersistedThoughtNode(
        id=node_id,
        type=node_type,  # type: ignore[arg-type]
        label=None,
        text=text,
        origin="user_created",
        explicitness="explicit",
        review_status=review_status,  # type: ignore[arg-type]
        confidence=None,
        source_anchor_ids=source_anchor_ids or [],
    )


def _edge(edge_id: str, source_node_id: str, target_node_id: str) -> PersistedThoughtEdge:
    return PersistedThoughtEdge(
        id=edge_id,
        source_node_id=source_node_id,
        target_node_id=target_node_id,
        type="supports",
        label=None,
        origin="user_created",
        explicitness="explicit",
        review_status="confirmed",
        confidence=None,
    )


def _snapshot(
    nodes: list[PersistedThoughtNode],
    edges: list[PersistedThoughtEdge] | None = None,
    anchors: dict[str, AnchorRef] | None = None,
) -> GraphRagSnapshot:
    return GraphRagSnapshot(
        note_id=NOTE_ID,
        title="秋招投递计划",
        thought_model=PersistedThoughtModel(
            id="model-1",
            note_id=str(NOTE_ID),
            version=1,
            title="秋招投递计划",
            nodes=nodes,
            edges=edges or [],
        ),
        anchors_by_id=anchors or {},
    )


def test_cosine_similarity_unit_vectors() -> None:
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    with pytest.raises(ValueError, match="dimensions"):
        cosine_similarity([1.0, 0.0], [1.0])


def test_rank_nodes_picks_similar_summaries_not_unsupported_claims() -> None:
    snapshot = _snapshot(
        [
            _node("claim-t0", "T0 目标是字节跳动"),
            _node("claim-bare", "没有证据的主张"),
        ]
    )
    ranked = rank_nodes_for_query(
        [(snapshot, node) for node in snapshot.thought_model.nodes],
        query_embedding=[1.0, 0.0],
        node_embeddings=[[1.0, 0.0], [0.0, 1.0]],
        k=5,
    )
    assert [item.node.id for item in ranked] == ["claim-t0"]
    assert ranked[0].score == pytest.approx(1.0)


def test_lexical_node_match_keeps_exact_terms_when_cosine_is_weak() -> None:
    snapshot = _snapshot(
        [
            _node("claim-t0", "T0 目标是字节跳动"),
            _node("claim-other", "秋招也要投腾讯"),
        ]
    )
    candidates = [(snapshot, node) for node in snapshot.thought_model.nodes]
    ranked = rank_nodes_for_query(
        candidates,
        query_embedding=[1.0, 0.0],
        node_embeddings=[[0.0, 1.0], [1.0, 0.0]],
        k=1,
    )
    merged = merge_ranked_with_lexical(ranked, candidates, "T0", k=5)
    assert [item.node.id for item in ranked] == ["claim-other"]
    assert {item.node.id for item in merged} == {"claim-t0", "claim-other"}


def test_expand_one_hop_adds_confirmed_neighbors() -> None:
    expanded = expand_one_hop(
        {"claim-t0"},
        [_edge("e-support", "evidence-t0", "claim-t0")],
    )
    assert expanded == {"claim-t0", "evidence-t0"}


def test_collect_block_ids_follows_source_anchors() -> None:
    nodes = [_node("claim-t0", "T0 目标是字节跳动", source_anchor_ids=[ANCHOR_T0])]
    block_ids = collect_block_ids(nodes, {ANCHOR_T0: AnchorRef(block_id="b-t0", quote="T0 目标是字节跳动")})
    assert block_ids == ["b-t0"]


def test_recall_statement_filters_block_ids() -> None:
    stmt = build_note_chunk_recall_statement(
        owner_id=1,
        query_embedding=[1.0, 0.0],
        k=5,
        block_ids=["b-t0", "b-other"],
    )
    sql = str(stmt.compile(dialect=postgresql.dialect())).lower()
    assert "block_id" in sql
    assert "in (" in sql or "in(" in sql


def test_lexical_recall_can_restrict_to_anchored_blocks() -> None:
    note_id = NOTE_ID
    hits = match_lexical_note_blocks(
        "T0",
        [
            (
                note_id,
                "秋招投递计划",
                {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "attrs": {"blockId": "b-t0"},
                            "content": [{"type": "text", "text": "T0 目标是字节跳动"}],
                        },
                        {
                            "type": "paragraph",
                            "attrs": {"blockId": "b-unrelated"},
                            "content": [{"type": "text", "text": "T0 也会出现在无关段"}],
                        },
                    ],
                },
            )
        ],
        k=5,
        block_ids=["b-t0"],
    )
    assert [hit.block_id for hit in hits] == ["b-t0"]


@pytest.mark.asyncio
async def test_execute_graph_rag_scopes_chunks_to_selected_anchors(
    mock_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    snapshot = _snapshot(
        [
            _node("claim-t0", "T0 目标是字节跳动", source_anchor_ids=[ANCHOR_T0]),
            _node("claim-other", "投递节奏另说", source_anchor_ids=[ANCHOR_OTHER]),
            _node("claim-suggested", "还没确认", review_status="suggested", source_anchor_ids=[ANCHOR_T0]),
        ],
        anchors={
            ANCHOR_T0: AnchorRef(block_id="b-t0", quote="T0 目标是字节跳动"),
            ANCHOR_OTHER: AnchorRef(block_id="b-other", quote="投递节奏另说"),
        },
    )
    recall = AsyncMock(
        return_value=[
            NoteChunkHit(
                note_id=str(NOTE_ID),
                note_title="秋招投递计划",
                block_id="b-t0",
                text="T0 目标是字节跳动",
                score=0.91,
            )
        ]
    )
    monkeypatch.setattr("src.app.services.graph_rag.load_graph_rag_snapshots", AsyncMock(return_value=[snapshot]))
    monkeypatch.setattr("src.app.services.graph_rag.recall_note_chunks", recall)
    monkeypatch.setattr("src.app.services.graph_rag.load_owner_current_note_docs", AsyncMock(return_value=[]))

    async def embed_texts(texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0] if "T0" in text else [0.0, 1.0] for text in texts]

    result = await execute_graph_rag(
        mock_db,
        owner_id=1,
        query_embedding=[1.0, 0.0],
        k=5,
        query_text="T0 目标是什么",
        embed_texts=embed_texts,
    )
    assert [node.node_id for node in result.nodes] == ["claim-t0"]
    assert [hit.block_id for hit in result.hits] == ["b-t0"]
    assert result.empty_reason is None
    assert recall.await_args.kwargs["block_ids"] == ["b-t0"]
    assert recall.await_args.kwargs["note_ids"] == [NOTE_ID]


@pytest.mark.asyncio
async def test_execute_graph_rag_does_not_fallback_when_graph_is_empty(
    mock_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    recall = AsyncMock(return_value=[])
    monkeypatch.setattr("src.app.services.graph_rag.load_graph_rag_snapshots", AsyncMock(return_value=[]))
    monkeypatch.setattr("src.app.services.graph_rag.recall_note_chunks", recall)

    result = await execute_graph_rag(mock_db, owner_id=1, query_embedding=[1.0, 0.0], k=5)
    assert result.empty_reason == "no_confirmed_nodes"
    assert result.hits == []
    recall.assert_not_awaited()


@pytest.mark.asyncio
async def test_execute_graph_rag_reports_unanchored_similar_nodes(
    mock_db, monkeypatch: pytest.MonkeyPatch
) -> None:
    snapshot = _snapshot([_node("claim-t0", "T0 目标是字节跳动")])
    recall = AsyncMock(return_value=[])
    monkeypatch.setattr("src.app.services.graph_rag.load_graph_rag_snapshots", AsyncMock(return_value=[snapshot]))
    monkeypatch.setattr("src.app.services.graph_rag.recall_note_chunks", recall)

    async def embed_texts(texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0] for _text in texts]

    result = await execute_graph_rag(
        mock_db,
        owner_id=1,
        query_embedding=[1.0, 0.0],
        k=5,
        query_text="T0",
        embed_texts=embed_texts,
    )
    assert result.empty_reason == "no_anchored_blocks"
    assert [node.node_id for node in result.nodes] == ["claim-t0"]
    recall.assert_not_awaited()
