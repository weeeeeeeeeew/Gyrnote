import uuid as uuid_pkg
from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from uuid6 import uuid7

ThoughtNodeType = Literal[
    "question",
    "concept",
    "observation",
    "claim",
    "evidence",
    "assumption",
    "counterpoint",
    "decision",
    "open_question",
    "action",
    "custom",
]
ThoughtEdgeType = Literal[
    "supports",
    "challenges",
    "depends_on",
    "qualifies",
    "explains",
    "leads_to",
    "answers",
    "tests",
    "custom",
]
ThoughtOrigin = Literal["ai_created", "user_created", "user_modified"]
ThoughtExplicitness = Literal["explicit", "inferred"]
ThoughtReviewStatus = Literal["suggested", "confirmed", "locked", "conflicted"]


def validate_tiptap_document(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("type") != "doc":
        raise ValueError("content_json must be a Tiptap doc")

    content = value.get("content")
    if content is not None and not isinstance(content, list):
        raise ValueError("content_json.content must be a list when present")

    return value


class SourceAnchorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid_pkg.UUID = Field(default_factory=uuid7)
    block_id: str = Field(min_length=1, max_length=128)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    quote: str = Field(min_length=1)
    quote_hash: str = Field(min_length=1, max_length=128)

    @field_validator("block_id", "quote", "quote_hash")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @model_validator(mode="after")
    def validate_offsets(self) -> Self:
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class SourceAnchorRead(SourceAnchorCreate):
    note_version_id: uuid_pkg.UUID
    created_at: datetime


class PersistedThoughtNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    type: ThoughtNodeType
    label: str | None = Field(default=None, max_length=80)
    text: str = Field(min_length=1)
    origin: ThoughtOrigin
    explicitness: ThoughtExplicitness
    review_status: ThoughtReviewStatus
    confidence: float | None = Field(default=None, ge=0, le=1)
    source_anchor_ids: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("id", "text")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @field_validator("source_anchor_ids")
    @classmethod
    def reject_blank_anchor_ids(cls, value: list[str]) -> list[str]:
        for anchor_id in value:
            if not anchor_id.strip():
                raise ValueError("source_anchor_ids must not contain blank values")
        return value

    @model_validator(mode="after")
    def validate_custom_label(self) -> Self:
        if self.type == "custom":
            if self.label is None or not self.label.strip():
                raise ValueError("custom nodes require a non-blank label")
            self.label = self.label.strip()
        else:
            self.label = None
        return self


class PersistedThoughtEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    source_node_id: str = Field(min_length=1, max_length=128)
    target_node_id: str = Field(min_length=1, max_length=128)
    type: ThoughtEdgeType
    label: str | None = Field(default=None, max_length=80)
    origin: ThoughtOrigin
    explicitness: ThoughtExplicitness
    review_status: ThoughtReviewStatus
    confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("id", "source_node_id", "target_node_id")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @model_validator(mode="after")
    def validate_custom_label(self) -> Self:
        if self.type == "custom":
            if self.label is None or not self.label.strip():
                raise ValueError("custom edges require a non-blank label")
            self.label = self.label.strip()
        else:
            self.label = None
        return self


class PersistedThoughtModel(BaseModel):
    """Confirmed ThoughtModel snapshot co-versioned with a NoteVersion. Never stores candidates."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    # Empty on first create: the note UUID does not exist until INSERT. Service fills it after flush.
    note_id: str = Field(default="", max_length=128)
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    nodes: list[PersistedThoughtNode] = Field(default_factory=list, max_length=500)
    edges: list[PersistedThoughtEdge] = Field(default_factory=list, max_length=1000)

    @field_validator("id", "title")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @field_validator("note_id")
    @classmethod
    def normalize_draft_note_id(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_edge_endpoints(self) -> Self:
        node_ids = {node.id for node in self.nodes}
        for edge in self.edges:
            if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
                raise ValueError("edge endpoints must reference nodes in the same model")
        return self


class GraphNodePosition(BaseModel):
    # Vue Flow positions may include view-only extras such as z. Layout is not domain state.
    model_config = ConfigDict(extra="ignore")

    x: float
    y: float

    @model_validator(mode="after")
    def validate_finite(self) -> Self:
        if not (self.x == self.x and self.y == self.y):  # NaN check
            raise ValueError("position coordinates must be finite")
        if abs(self.x) == float("inf") or abs(self.y) == float("inf"):
            raise ValueError("position coordinates must be finite")
        return self


class PersistedGraphLayout(BaseModel):
    """View-only graph layout overrides. Not part of ThoughtModel domain nodes/edges."""

    model_config = ConfigDict(extra="forbid")

    node_positions: dict[str, GraphNodePosition] = Field(default_factory=dict, max_length=500)
    edge_path_style: Literal["default", "smoothstep", "straight"] = "default"

    @field_validator("node_positions")
    @classmethod
    def reject_blank_node_ids(cls, value: dict[str, GraphNodePosition]) -> dict[str, GraphNodePosition]:
        for node_id in value:
            if not node_id.strip():
                raise ValueError("node_positions keys must not be blank")
        return value


class NoteContentBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    content_json: dict[str, Any]
    source_anchors: list[SourceAnchorCreate] = Field(default_factory=list, max_length=500)
    thought_model: PersistedThoughtModel | None = None
    graph_layout: PersistedGraphLayout | None = None

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value

    @field_validator("content_json")
    @classmethod
    def validate_content_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_tiptap_document(value)

    @model_validator(mode="after")
    def validate_unique_source_anchor_ids(self) -> Self:
        # M2.4 learning checkpoint: reject duplicate logical anchors before the transaction starts.
        ids = [anchor.id for anchor in self.source_anchors]
        if len(set(ids)) != len(ids):
            raise ValueError("source anchor ids must be unique")
        return self


class NoteCreate(NoteContentBase):
    pass


class NoteVersionCreate(NoteContentBase):
    expected_revision: int = Field(ge=1)


class NoteVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid_pkg.UUID
    note_id: uuid_pkg.UUID
    version_no: int
    title: str
    content_json: dict[str, Any]
    content_hash: str
    thought_model_json: dict[str, Any]
    graph_layout_json: dict[str, Any]
    created_at: datetime


class NoteListItem(BaseModel):
    id: uuid_pkg.UUID
    title: str
    revision: int
    updated_at: datetime


class NoteRead(BaseModel):
    id: uuid_pkg.UUID
    owner_id: int
    title: str
    content_json: dict[str, Any]
    revision: int
    current_version: NoteVersionRead
    source_anchors: list[SourceAnchorRead]
    thought_model: PersistedThoughtModel
    graph_layout: PersistedGraphLayout
    chunk_index_error: str | None = None
    created_at: datetime
    updated_at: datetime
