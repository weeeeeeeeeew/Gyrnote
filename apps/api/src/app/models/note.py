import uuid as uuid_pkg
from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from uuid6 import uuid7

from ..core.db.database import Base


class Note(Base):
    __tablename__ = "note"
    __table_args__ = (Index("ix_note_owner_updated_at", "owner_id", "updated_at"),)

    id: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default_factory=uuid7, init=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    current_version_id: Mapped[uuid_pkg.UUID | None] = mapped_column(
        ForeignKey(
            "note_version.id",
            name="fk_note_current_version_id_note_version",
            ondelete="SET NULL",
            use_alter=True,
        ),
        default=None,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default_factory=lambda: datetime.now(UTC), init=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default_factory=lambda: datetime.now(UTC), init=False
    )


class NoteVersion(Base):
    __tablename__ = "note_version"
    __table_args__ = (
        UniqueConstraint("note_id", "version_no", name="uq_note_version_note_id_version_no"),
        Index("ix_note_version_note_id_created_at", "note_id", "created_at"),
    )

    id: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default_factory=uuid7, init=False)
    note_id: Mapped[uuid_pkg.UUID] = mapped_column(ForeignKey("note.id", ondelete="CASCADE"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    content_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    content_hash: Mapped[str] = mapped_column(String(64))
    thought_model_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    graph_layout_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default_factory=lambda: datetime.now(UTC), init=False
    )


class SourceAnchor(Base):
    __tablename__ = "source_anchor"
    __table_args__ = (
        CheckConstraint("start_offset >= 0", name="ck_source_anchor_start_offset_non_negative"),
        CheckConstraint("end_offset > start_offset", name="ck_source_anchor_offsets_ordered"),
        UniqueConstraint("note_version_id", "anchor_id", name="uq_source_anchor_version_anchor_id"),
        Index("ix_source_anchor_note_version_block_id", "note_version_id", "block_id"),
    )

    id: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default_factory=uuid7, init=False)
    note_version_id: Mapped[uuid_pkg.UUID] = mapped_column(
        ForeignKey("note_version.id", ondelete="CASCADE"), index=True
    )
    anchor_id: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True))
    block_id: Mapped[str] = mapped_column(String(128))
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    quote: Mapped[str] = mapped_column(Text)
    quote_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default_factory=lambda: datetime.now(UTC), init=False
    )


class NoteChunk(Base):
    """Note body span for retrieval. Fact source is the note, not the graph."""

    __tablename__ = "note_chunk"
    __table_args__ = (UniqueConstraint("note_version_id", "block_id", name="uq_note_chunk_version_block_id"),)

    id: Mapped[uuid_pkg.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default_factory=uuid7, init=False)
    note_version_id: Mapped[uuid_pkg.UUID] = mapped_column(
        ForeignKey("note_version.id", ondelete="CASCADE"), index=True
    )
    block_id: Mapped[str] = mapped_column(String(128))
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(VECTOR())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default_factory=lambda: datetime.now(UTC), init=False
    )
