"""Add thought_model_json to note_version for confirmed ThoughtModel snapshots.

Revision ID: 20260815_0001
Revises: 20260717_0001
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260815_0001"
down_revision: str | None = "20260717_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "note_version",
        sa.Column(
            "thought_model_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{\"nodes\": [], \"edges\": []}'::jsonb"),
        ),
    )
    op.alter_column("note_version", "thought_model_json", server_default=None)


def downgrade() -> None:
    op.drop_column("note_version", "thought_model_json")
