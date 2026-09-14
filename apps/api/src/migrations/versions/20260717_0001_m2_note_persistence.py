"""Create the initial Gyrnote schema, including M2 source anchors.

Revision ID: 20260717_0001
Revises:
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260717_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tier",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        sa.UniqueConstraint("name"),
        if_not_exists=True,
    )

    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=30), nullable=False),
        sa.Column("username", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=50), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("profile_image_url", sa.String(), nullable=False),
        sa.Column("uuid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("tier_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tier_id"], ["tier.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
        if_not_exists=True,
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True, if_not_exists=True)
    op.create_index("ix_user_is_deleted", "user", ["is_deleted"], if_not_exists=True)
    op.create_index("ix_user_tier_id", "user", ["tier_id"], if_not_exists=True)
    op.create_index("ix_user_username", "user", ["username"], unique=True, if_not_exists=True)

    op.create_table(
        "post",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=30), nullable=False),
        sa.Column("text", sa.String(length=63206), nullable=False),
        sa.Column("uuid", sa.UUID(), nullable=False),
        sa.Column("media_url", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        sa.UniqueConstraint("uuid"),
        if_not_exists=True,
    )
    op.create_index("ix_post_created_by_user_id", "post", ["created_by_user_id"], if_not_exists=True)
    op.create_index("ix_post_is_deleted", "post", ["is_deleted"], if_not_exists=True)

    op.create_table(
        "rate_limit",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tier_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("limit", sa.Integer(), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tier_id"], ["tier.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        sa.UniqueConstraint("name"),
        if_not_exists=True,
    )
    op.create_index("ix_rate_limit_tier_id", "rate_limit", ["tier_id"], if_not_exists=True)

    op.create_table(
        "token_blacklist",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_token_blacklist_token", "token_blacklist", ["token"], unique=True, if_not_exists=True)

    op.create_table(
        "note",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index("ix_note_owner_id", "note", ["owner_id"], if_not_exists=True)
    op.create_index("ix_note_owner_updated_at", "note", ["owner_id", "updated_at"], if_not_exists=True)

    op.create_table(
        "note_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["note.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("note_id", "version_no", name="uq_note_version_note_id_version_no"),
        if_not_exists=True,
    )
    op.create_index("ix_note_version_note_id", "note_version", ["note_id"], if_not_exists=True)
    op.create_index(
        "ix_note_version_note_id_created_at", "note_version", ["note_id", "created_at"], if_not_exists=True
    )

    op.add_column("note", sa.Column("current_version_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_note_current_version_id_note_version",
        "note",
        "note_version",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_note_current_version_id", "note", ["current_version_id"], if_not_exists=True)

    op.create_table(
        "source_anchor",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("anchor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("block_id", sa.String(length=128), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("quote_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_offset > start_offset", name="ck_source_anchor_offsets_ordered"),
        sa.CheckConstraint("start_offset >= 0", name="ck_source_anchor_start_offset_non_negative"),
        sa.ForeignKeyConstraint(["note_version_id"], ["note_version.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("note_version_id", "anchor_id", name="uq_source_anchor_version_anchor_id"),
        if_not_exists=True,
    )
    op.create_index("ix_source_anchor_note_version_id", "source_anchor", ["note_version_id"], if_not_exists=True)
    op.create_index(
        "ix_source_anchor_note_version_block_id",
        "source_anchor",
        ["note_version_id", "block_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_source_anchor_note_version_block_id", table_name="source_anchor")
    op.drop_index("ix_source_anchor_note_version_id", table_name="source_anchor")
    op.drop_table("source_anchor")

    op.drop_index("ix_note_current_version_id", table_name="note")
    op.drop_constraint("fk_note_current_version_id_note_version", "note", type_="foreignkey")
    op.drop_column("note", "current_version_id")

    op.drop_index("ix_note_version_note_id_created_at", table_name="note_version")
    op.drop_index("ix_note_version_note_id", table_name="note_version")
    op.drop_table("note_version")

    op.drop_index("ix_note_owner_updated_at", table_name="note")
    op.drop_index("ix_note_owner_id", table_name="note")
    op.drop_table("note")

    op.drop_index("ix_rate_limit_tier_id", table_name="rate_limit")
    op.drop_table("rate_limit")

    op.drop_index("ix_token_blacklist_token", table_name="token_blacklist")
    op.drop_table("token_blacklist")

    op.drop_index("ix_post_is_deleted", table_name="post")
    op.drop_index("ix_post_created_by_user_id", table_name="post")
    op.drop_table("post")

    op.drop_index("ix_user_username", table_name="user")
    op.drop_index("ix_user_tier_id", table_name="user")
    op.drop_index("ix_user_is_deleted", table_name="user")
    op.drop_index("ix_user_email", table_name="user")
    op.drop_table("user")

    op.drop_table("tier")
