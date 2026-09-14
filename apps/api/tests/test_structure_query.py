"""Deterministic structure-query fixtures. Graph filters; notes remain the fact source."""

from __future__ import annotations

import uuid as uuid_pkg

import pytest

from src.app.schemas.note import PersistedThoughtEdge, PersistedThoughtModel, PersistedThoughtNode
from src.app.services.structure_query import StructureNoteSnapshot, match_structure_query

NOTE_WEAK = uuid_pkg.UUID("11111111-1111-1111-1111-111111111111")
NOTE_SHARED_A = uuid_pkg.UUID("22222222-2222-2222-2222-222222222222")
NOTE_SHARED_B = uuid_pkg.UUID("33333333-3333-3333-3333-333333333333")
NOTE_OPEN = uuid_pkg.UUID("44444444-4444-4444-4444-444444444444")
ANCHOR_WEAK = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _node(
    node_id: str,
    node_type: str,
    text: str,
    *,
    review_status: str = "confirmed",
    source_anchor_ids: list[str] | None = None,
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


def _edge(
    edge_id: str,
    source_node_id: str,
    target_node_id: str,
    edge_type: str,
    *,
    review_status: str = "confirmed",
) -> PersistedThoughtEdge:
    return PersistedThoughtEdge(
        id=edge_id,
        source_node_id=source_node_id,
        target_node_id=target_node_id,
        type=edge_type,  # type: ignore[arg-type]
        label=None,
        origin="user_created",
        explicitness="explicit",
        review_status=review_status,  # type: ignore[arg-type]
        confidence=None,
    )


def _snapshot(
    note_id: uuid_pkg.UUID,
    title: str,
    nodes: list[PersistedThoughtNode],
    edges: list[PersistedThoughtEdge],
    quotes_by_anchor_id: dict[str, str] | None = None,
) -> StructureNoteSnapshot:
    return StructureNoteSnapshot(
        note_id=note_id,
        title=title,
        thought_model=PersistedThoughtModel(
            id=f"model-{note_id}",
            note_id=str(note_id),
            version=1,
            title=title,
            nodes=nodes,
            edges=edges,
        ),
        quotes_by_anchor_id=quotes_by_anchor_id or {},
    )


def sample_notes() -> list[StructureNoteSnapshot]:
    return [
        _snapshot(
            NOTE_WEAK,
            "薄弱论点笔记",
            [
                _node("claim-bare", "claim", "没有证据的主张", source_anchor_ids=[ANCHOR_WEAK]),
                _node("claim-supported", "claim", "有证据的主张"),
                _node("evidence-1", "evidence", "一条证据"),
                _node("claim-suggested", "claim", "还没确认的主张", review_status="suggested"),
            ],
            [
                _edge("e-support", "evidence-1", "claim-supported", "supports"),
            ],
            quotes_by_anchor_id={ANCHOR_WEAK: "秋招方向需要可回原文的结构图"},
        ),
        _snapshot(
            NOTE_SHARED_A,
            "共同前提甲",
            [
                _node("assumption-a", "assumption", "结构必须能回到笔记"),
                _node("claim-a", "claim", "因此要先锚定"),
            ],
            [_edge("e-dep-a", "claim-a", "assumption-a", "depends_on")],
        ),
        _snapshot(
            NOTE_SHARED_B,
            "共同前提乙",
            [
                _node("assumption-b", "assumption", "结构必须能回到笔记"),
                _node("decision-b", "decision", "所以检索仍回原文"),
            ],
            [_edge("e-dep-b", "decision-b", "assumption-b", "depends_on")],
        ),
        _snapshot(
            NOTE_OPEN,
            "未闭环问题笔记",
            [
                _node("q-open", "open_question", "检索对象到底是图还是笔记？"),
                _node("q-answered", "open_question", "锁定后还会被改写吗？"),
                _node("answer-1", "claim", "锁定后跳过"),
            ],
            [_edge("e-answers", "answer-1", "q-answered", "answers")],
        ),
    ]


def test_unknown_kind_fails_closed() -> None:
    try:
        result = match_structure_query("not_a_kind", sample_notes())  # type: ignore[arg-type]
    except NotImplementedError:
        pytest.fail("match_structure_query is not implemented")
    except ValueError:
        return
    raise AssertionError(f"unknown kind must fail closed, got {result!r}")


def test_unsupported_claims_skips_supported_and_suggested() -> None:
    hits = match_structure_query("unsupported_claims", sample_notes())
    ids = {(hit.note_id, hit.node_id) for hit in hits}
    assert (str(NOTE_WEAK), "claim-bare") in ids
    assert (str(NOTE_WEAK), "claim-supported") not in ids
    assert (str(NOTE_WEAK), "claim-suggested") not in ids
    bare = next(hit for hit in hits if hit.node_id == "claim-bare")
    assert "秋招方向需要可回原文的结构图" in bare.quotes


def test_shared_assumption_requires_two_notes() -> None:
    hits = match_structure_query("shared_assumption", sample_notes())
    texts = {hit.node_text.strip() for hit in hits}
    assert texts == {"结构必须能回到笔记"}
    note_ids = {hit.note_id for hit in hits}
    assert {str(NOTE_SHARED_A), str(NOTE_SHARED_B)} <= note_ids


def test_open_questions_skip_answered() -> None:
    hits = match_structure_query("open_questions", sample_notes())
    ids = {hit.node_id for hit in hits}
    assert "q-open" in ids
    assert "q-answered" not in ids
