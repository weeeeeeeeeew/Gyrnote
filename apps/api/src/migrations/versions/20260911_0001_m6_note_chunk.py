"""Store note-body chunks for retrieval. Embeddings use pgvector; ranking is cosine distance.

Revision ID: 20260911_0001
Revises: 20260816_0001
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects import postgresql

revision: str = "20260911_0001"
down_revision: str | None = "20260816_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    op.create_table(
        "note_chunk",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("block_id", sa.String(length=128), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", VECTOR(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_version_id"], ["note_version.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("note_version_id", "block_id", name="uq_note_chunk_version_block_id"),
    )
    op.create_index("ix_note_chunk_note_version_id", "note_chunk", ["note_version_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_note_chunk_note_version_id", table_name="note_chunk")
    op.drop_table("note_chunk")
    op.execute(sa.text("DROP EXTENSION IF EXISTS vector"))
