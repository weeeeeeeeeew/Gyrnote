"""Rank note-body chunks with pgvector cosine distance. Does not call a model."""

from __future__ import annotations

import uuid as uuid_pkg

from sqlalchemy import Select, String, cast, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.note import Note, NoteChunk, NoteVersion
from ..schemas.chunk_recall import NoteChunkHit, NoteChunkRecallRead


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
) -> list[NoteChunkHit]:
    """Return the top-k note body chunks by pgvector cosine similarity (higher is better).

    Ranking happens in Postgres: score = 1 - (embedding <=> query).
    Owner isolation is part of the SQL. Skip zero-vector chunks via vector_norm.
    Fail closed with ValueError when k < 1, the query is empty/zero, or dimensions differ.
    Do not call an LLM. Do not load all embeddings into Python to rank.
    """
    ensure_chunk_recall_query(query_embedding, k)
    stmt = build_note_chunk_recall_statement(owner_id, query_embedding, k, note_ids)
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
) -> NoteChunkRecallRead:
    hits = await recall_note_chunks(db, owner_id, query_embedding, k, note_ids)
    return NoteChunkRecallRead(hits=hits)
