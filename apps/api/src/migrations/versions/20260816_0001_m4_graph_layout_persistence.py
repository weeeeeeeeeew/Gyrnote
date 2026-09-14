"""Add graph_layout_json to note_version for view layout overrides.

Revision ID: 20260816_0001
Revises: 20260815_0001
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260816_0001"
down_revision: str | None = "20260815_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "note_version",
        sa.Column(
            "graph_layout_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(
                "'{\"node_positions\": {}, \"edge_path_style\": \"default\"}'::jsonb"
            ),
        ),
    )
    op.alter_column("note_version", "graph_layout_json", server_default=None)


def downgrade() -> None:
    op.drop_column("note_version", "graph_layout_json")
