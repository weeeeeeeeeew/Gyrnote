"""Deterministic note-body chunk recall. No live LLM. Not GraphRAG."""

from __future__ import annotations

import uuid as uuid_pkg

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import DBAPIError

from src.app.services.chunk_recall import (
    build_note_chunk_recall_statement,
    ensure_chunk_recall_query,
    reraise_pgvector_dim_mismatch,
)
from src.app.services.note_blocks import extract_note_blocks


def test_extract_note_blocks_skips_blank_and_walks_nested() -> None:
    blocks = extract_note_blocks(
        {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"blockId": "block-title", "level": 1},
                    "content": [{"type": "text", "text": "标题"}],
                },
                {
                    "type": "paragraph",
                    "attrs": {"blockId": "block-a"},
                    "content": [{"type": "text", "text": "有内容"}],
                },
                {
                    "type": "paragraph",
                    "attrs": {"blockId": "block-b"},
                    "content": [{"type": "text", "text": "   "}],
                },
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "attrs": {"blockId": "block-nested"},
                                    "content": [{"type": "text", "text": "嵌套段落"}],
                                }
                            ],
                        }
                    ],
                },
            ],
        }
    )
    assert [(block.id, block.text) for block in blocks] == [
        ("block-title", "标题"),
        ("block-a", "有内容"),
        ("block-nested", "嵌套段落"),
    ]


def test_extract_note_blocks_malformed_returns_empty() -> None:
    assert extract_note_blocks(None) == []
    assert extract_note_blocks("not-a-doc") == []
    assert extract_note_blocks({}) == []


def test_recall_statement_uses_pgvector_cosine() -> None:
    stmt = build_note_chunk_recall_statement(
        owner_id=1,
        query_embedding=[0.9, 0.1, 0.0, 0.0],
        k=2,
    )
    sql = str(stmt.compile(dialect=postgresql.dialect())).lower()
    assert "<=>" in sql or "cosine_distance" in sql
    assert "vector_norm" in sql
    assert "owner_id" in sql


def test_recall_statement_filters_optional_note_ids() -> None:
    note_id = uuid_pkg.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    stmt = build_note_chunk_recall_statement(
        owner_id=1,
        query_embedding=[1.0, 0.0],
        k=1,
        note_ids=[note_id],
    )
    sql = str(stmt.compile(dialect=postgresql.dialect())).lower()
    assert "note.id" in sql or "note_1.id" in sql
    assert "in (" in sql or "in(" in sql


def test_recall_zero_query_fails_closed() -> None:
    with pytest.raises(ValueError, match="zero"):
        ensure_chunk_recall_query([0.0, 0.0, 0.0, 0.0], k=1)


def test_recall_rejects_k_below_one() -> None:
    with pytest.raises(ValueError, match="k"):
        ensure_chunk_recall_query([1.0, 0.0], k=0)


def test_recall_empty_query_fails_closed() -> None:
    with pytest.raises(ValueError, match="empty"):
        ensure_chunk_recall_query([], k=1)


def test_recall_dim_mismatch_fails_closed() -> None:
    error = DBAPIError("SELECT 1", None, Exception("ERROR: different vector dimensions 4 and 2"))
    with pytest.raises(ValueError, match="dimensions"):
        reraise_pgvector_dim_mismatch(error)
        raise AssertionError("dim mismatch must fail closed")
