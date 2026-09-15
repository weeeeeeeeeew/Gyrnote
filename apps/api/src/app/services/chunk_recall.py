"""Rank note-body chunks with pgvector cosine distance. Does not call a model."""

from __future__ import annotations

import uuid as uuid_pkg

from sqlalchemy import Select, String, cast, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.note import Note, NoteChunk, NoteVersion
from ..schemas.chunk_recall import NoteChunkHit, NoteChunkRecallRead
from .note_blocks import extract_note_blocks


def ensure_chunk_recall_query(query_embedding: list[float], k: int) -> None:
    if k < 1:
        raise ValueError("k must be >= 1")
    if not query_embedding:
        raise ValueError("query embedding is empty")
    if all(component == 0 for component in query_embedding):
        raise ValueError("query embedding is zero")


def build_note_chunk_recall_statement(
    owner_id: int,
    query_embedding: list[float],
    k: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
    block_ids: list[str] | None = None,
) -> Select[tuple[uuid_pkg.UUID, str, str, str, float]]:
    distance = NoteChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(
            Note.id,
            Note.title,
            NoteChunk.block_id,
            NoteChunk.text,
            (1 - distance).label("score"),
        )
        .join(NoteVersion, Note.current_version_id == NoteVersion.id)
        .join(NoteChunk, NoteChunk.note_version_id == NoteVersion.id)
        .where(Note.owner_id == owner_id)
        .where(func.vector_norm(NoteChunk.embedding) > 0)
        .order_by(distance, cast(Note.id, String), NoteChunk.block_id)
        .limit(k)
    )
    if note_ids:
        stmt = stmt.where(Note.id.in_(note_ids))
    if block_ids:
        stmt = stmt.where(NoteChunk.block_id.in_(block_ids))
    return stmt


def build_indexed_chunk_count_statement(
    owner_id: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
    block_ids: list[str] | None = None,
) -> Select[tuple[int]]:
    stmt = (
        select(func.count())
        .select_from(NoteChunk)
        .join(NoteVersion, NoteChunk.note_version_id == NoteVersion.id)
        .join(Note, Note.current_version_id == NoteVersion.id)
        .where(Note.owner_id == owner_id)
        .where(func.vector_norm(NoteChunk.embedding) > 0)
    )
    if note_ids:
        stmt = stmt.where(Note.id.in_(note_ids))
    if block_ids:
        stmt = stmt.where(NoteChunk.block_id.in_(block_ids))
    return stmt


def reraise_pgvector_dim_mismatch(exc: BaseException) -> None:
    detail = str(exc.orig) if isinstance(exc, DBAPIError) and exc.orig is not None else str(exc)
    if "different vector dimensions" in detail.lower():
        raise ValueError("embedding dimensions do not match") from exc


async def recall_note_chunks(
    db: AsyncSession,
    owner_id: int,
    query_embedding: list[float],
    k: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
    block_ids: list[str] | None = None,
) -> list[NoteChunkHit]:
    """Return the top-k note body chunks by pgvector cosine similarity (higher is better).

    Ranking happens in Postgres: score = 1 - (embedding <=> query).
    Owner isolation is part of the SQL. Skip zero-vector chunks via vector_norm.
    Fail closed with ValueError when k < 1, the query is empty/zero, or dimensions differ.
    Do not call an LLM. Do not load all embeddings into Python to rank.
    """
    ensure_chunk_recall_query(query_embedding, k)
    stmt = build_note_chunk_recall_statement(owner_id, query_embedding, k, note_ids, block_ids)
    try:
        rows = await db.execute(stmt)
    except DBAPIError as exc:
        reraise_pgvector_dim_mismatch(exc)
        raise
    hits: list[NoteChunkHit] = []
    for note_id, title, block_id, text, score in rows.all():
        hits.append(
            NoteChunkHit(
                note_id=str(note_id),
                note_title=title,
                block_id=block_id,
                text=text,
                score=float(score),
            )
        )
    return hits


async def execute_chunk_recall(
    db: AsyncSession,
    owner_id: int,
    query_embedding: list[float],
    k: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
    query_text: str | None = None,
) -> NoteChunkRecallRead:
    hits = await recall_note_chunks(db, owner_id, query_embedding, k, note_ids)
    count_result = await db.execute(build_indexed_chunk_count_statement(owner_id, note_ids))
    indexed_chunk_count = int(count_result.scalar_one() or 0)
    if query_text and query_text.strip():
        docs = await load_owner_current_note_docs(db, owner_id, note_ids)
        lexical_hits = match_lexical_note_blocks(query_text, docs, k)
        hits = merge_recall_hits(hits, lexical_hits, k)
    return NoteChunkRecallRead(hits=hits, indexed_chunk_count=indexed_chunk_count)


def match_lexical_note_blocks(
    query: str,
    notes: list[tuple[uuid_pkg.UUID, str, dict]],
    k: int,
    block_ids: list[str] | None = None,
) -> list[NoteChunkHit]:
    needle = query.strip().casefold()
    if not needle or k < 1:
        return []
    allowed = set(block_ids) if block_ids else None
    hits: list[NoteChunkHit] = []
    for note_id, title, content_json in notes:
        for block in extract_note_blocks(content_json):
            if allowed is not None and block.id not in allowed:
                continue
            if needle not in block.text.casefold():
                continue
            hits.append(
                NoteChunkHit(
                    note_id=str(note_id),
                    note_title=title,
                    block_id=block.id,
                    text=block.text,
                    score=1.0,
                )
            )
            if len(hits) >= k:
                return hits
    return hits


def merge_recall_hits(
    vector_hits: list[NoteChunkHit],
    lexical_hits: list[NoteChunkHit],
    k: int,
) -> list[NoteChunkHit]:
    seen: set[tuple[str, str]] = set()
    merged: list[NoteChunkHit] = []
    for hit in [*vector_hits, *lexical_hits]:
        key = (hit.note_id, hit.block_id)
        if key in seen:
            continue
        seen.add(key)
        merged.append(hit)
        if len(merged) >= k:
            break
    return merged


async def load_owner_current_note_docs(
    db: AsyncSession,
    owner_id: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
) -> list[tuple[uuid_pkg.UUID, str, dict]]:
    stmt = (
        select(Note.id, Note.title, NoteVersion.content_json)
        .join(NoteVersion, Note.current_version_id == NoteVersion.id)
        .where(Note.owner_id == owner_id)
    )
    if note_ids:
        stmt = stmt.where(Note.id.in_(note_ids))
    rows = await db.execute(stmt)
    return [(note_id, title, content_json) for note_id, title, content_json in rows.all()]
