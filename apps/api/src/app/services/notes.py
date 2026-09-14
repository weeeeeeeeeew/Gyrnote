import hashlib
import json
import uuid as uuid_pkg
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.note import Note, NoteVersion, SourceAnchor
from ..schemas.note import (
    NoteCreate,
    NoteRead,
    NoteVersionCreate,
    NoteVersionRead,
    PersistedGraphLayout,
    PersistedThoughtModel,
    SourceAnchorCreate,
    SourceAnchorRead,
)
from .note_chunks import EmbedTexts, create_chunk_models, prepare_note_chunks


class NoteNotFoundError(Exception):
    pass


class NoteRevisionConflictError(Exception):
    def __init__(self, current_revision: int) -> None:
        super().__init__("Note revision is stale")
        self.current_revision = current_revision


def calculate_content_hash(content_json: dict[str, Any]) -> str:
    canonical_json = json.dumps(content_json, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


async def create_note(
    db: AsyncSession,
    owner_id: int,
    payload: NoteCreate,
    *,
    embed_texts: EmbedTexts | None = None,
) -> NoteRead:
    chunk_drafts = await prepare_note_chunks(payload.content_json, embed_texts=embed_texts)
    try:
        note = Note(owner_id=owner_id, title=payload.title.strip(), content_json=payload.content_json)
        db.add(note)
        await db.flush()

        version = create_version_model(note, 1, payload)
        db.add(version)
        await db.flush()

        anchors = create_anchor_models(version.id, payload.source_anchors)
        db.add_all(anchors)
        chunks = create_chunk_models(version.id, chunk_drafts)
        if chunks:
            db.add_all(chunks)
        note.current_version_id = version.id

        await db.commit()
        return build_note_read(note, version, anchors)
    except Exception:
        await db.rollback()
        raise


async def get_note(db: AsyncSession, owner_id: int, note_id: uuid_pkg.UUID) -> NoteRead:
    note_result = await db.execute(select(Note).where(Note.id == note_id, Note.owner_id == owner_id))
    note = note_result.scalar_one_or_none()

    if note is None or note.current_version_id is None:
        raise NoteNotFoundError

    version_result = await db.execute(select(NoteVersion).where(NoteVersion.id == note.current_version_id))
    version = version_result.scalar_one_or_none()

    if version is None:
        raise NoteNotFoundError

    anchors_result = await db.execute(
        select(SourceAnchor)
        .where(SourceAnchor.note_version_id == version.id)
        .order_by(SourceAnchor.created_at, SourceAnchor.id)
    )
    anchors = list(anchors_result.scalars().all())
    return build_note_read(note, version, anchors)


async def save_note_version(
    db: AsyncSession,
    owner_id: int,
    note_id: uuid_pkg.UUID,
    payload: NoteVersionCreate,
    *,
    embed_texts: EmbedTexts | None = None,
) -> NoteRead:
    chunk_drafts = await prepare_note_chunks(payload.content_json, embed_texts=embed_texts)
    try:
        note_result = await db.execute(
            select(Note).where(Note.id == note_id, Note.owner_id == owner_id).with_for_update()
        )
        note = note_result.scalar_one_or_none()

        if note is None:
            raise NoteNotFoundError

        if note.revision != payload.expected_revision:
            raise NoteRevisionConflictError(note.revision)

        latest_version_no = await db.scalar(
            select(func.coalesce(func.max(NoteVersion.version_no), 0)).where(NoteVersion.note_id == note.id)
        )
        version_no = int(latest_version_no or 0) + 1
        version = create_version_model(note, version_no, payload)
        db.add(version)
        await db.flush()

        anchors = create_anchor_models(version.id, payload.source_anchors)
        db.add_all(anchors)
        chunks = create_chunk_models(version.id, chunk_drafts)
        if chunks:
            db.add_all(chunks)

        note.title = payload.title.strip()
        note.content_json = payload.content_json
        note.current_version_id = version.id
        note.revision += 1
        note.updated_at = datetime.now(UTC)

        await db.commit()
        return build_note_read(note, version, anchors)
    except Exception:
        await db.rollback()
        raise


def create_version_model(note: Note, version_no: int, payload: NoteCreate | NoteVersionCreate) -> NoteVersion:
    return NoteVersion(
        note_id=note.id,
        version_no=version_no,
        title=payload.title.strip(),
        content_json=payload.content_json,
        content_hash=calculate_content_hash(payload.content_json),
        thought_model_json=resolve_thought_model_json(note, payload),
        graph_layout_json=resolve_graph_layout_json(payload),
    )


def resolve_thought_model_json(note: Note, payload: NoteCreate | NoteVersionCreate) -> dict[str, Any]:
    note_id = str(note.id)
    if payload.thought_model is None:
        return {
            "id": f"model-{note_id}",
            "note_id": note_id,
            "version": 1,
            "title": payload.title.strip(),
            "nodes": [],
            "edges": [],
        }

    data = payload.thought_model.model_dump(mode="json")
    data["note_id"] = note_id
    data["title"] = payload.title.strip()
    return PersistedThoughtModel.model_validate(data).model_dump(mode="json")


def resolve_graph_layout_json(payload: NoteCreate | NoteVersionCreate) -> dict[str, Any]:
    layout = payload.graph_layout or PersistedGraphLayout()
    return layout.model_dump(mode="json")


def create_anchor_models(
    note_version_id: uuid_pkg.UUID, source_anchors: Sequence[SourceAnchorCreate]
) -> list[SourceAnchor]:
    return [
        SourceAnchor(
            note_version_id=note_version_id,
            anchor_id=anchor.id,
            block_id=anchor.block_id,
            start_offset=anchor.start_offset,
            end_offset=anchor.end_offset,
            quote=anchor.quote,
            quote_hash=anchor.quote_hash,
        )
        for anchor in source_anchors
    ]


def build_note_read(note: Note, version: NoteVersion, anchors: Sequence[SourceAnchor]) -> NoteRead:
    return NoteRead(
        id=note.id,
        owner_id=note.owner_id,
        title=note.title,
        content_json=note.content_json,
        revision=note.revision,
        current_version=NoteVersionRead.model_validate(version),
        source_anchors=[
            SourceAnchorRead(
                id=anchor.anchor_id,
                note_version_id=anchor.note_version_id,
                block_id=anchor.block_id,
                start_offset=anchor.start_offset,
                end_offset=anchor.end_offset,
                quote=anchor.quote,
                quote_hash=anchor.quote_hash,
                created_at=anchor.created_at,
            )
            for anchor in anchors
        ],
        thought_model=coerce_persisted_thought_model(version.thought_model_json, note),
        graph_layout=coerce_persisted_graph_layout(getattr(version, "graph_layout_json", None)),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def coerce_persisted_thought_model(raw: dict[str, Any] | None, note: Note) -> PersistedThoughtModel:
    note_id = str(note.id)
    if not raw or not isinstance(raw, dict) or "id" not in raw:
        return PersistedThoughtModel(
            id=f"model-{note_id}",
            note_id=note_id,
            version=1,
            title=note.title,
            nodes=[],
            edges=[],
        )
    try:
        data = {**raw, "note_id": note_id}
        if not data.get("title"):
            data["title"] = note.title
        return PersistedThoughtModel.model_validate(data)
    except Exception:
        return PersistedThoughtModel(
            id=f"model-{note_id}",
            note_id=note_id,
            version=1,
            title=note.title,
            nodes=[],
            edges=[],
        )


def coerce_persisted_graph_layout(raw: dict[str, Any] | None) -> PersistedGraphLayout:
    if not raw or not isinstance(raw, dict):
        return PersistedGraphLayout()
    try:
        return PersistedGraphLayout.model_validate(raw)
    except Exception:
        return PersistedGraphLayout()
