from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class CompileSourceAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    quote: str = Field(min_length=1)
    block_id: str = Field(min_length=1, max_length=128)

    @field_validator("id", "quote", "block_id")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value


class CompileNoteBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1)

    @field_validator("id", "text")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value


class ProposedSourceAnchor(BaseModel):
    """Evidence span proposed by LLM and localized against a known note block."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    block_id: str = Field(min_length=1, max_length=128)
    quote: str = Field(min_length=1)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=0)

    @field_validator("id", "block_id", "quote")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.start_offset >= self.end_offset:
            raise ValueError("start_offset must be less than end_offset")
        if self.end_offset - self.start_offset != len(self.quote):
            raise ValueError("offset range must match quote length")
        return self


class CandidateCompileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note_id: str = Field(min_length=1, max_length=128)
    source_revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    source_anchors: list[CompileSourceAnchor] = Field(default_factory=list, max_length=200)
    note_blocks: list[CompileNoteBlock] = Field(default_factory=list, max_length=400)

    @field_validator("note_id", "title")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value


class CandidateThoughtNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    type: ThoughtNodeType
    label: str | None = Field(default=None, max_length=80)
    text: str = Field(min_length=1)
    # One claim may cite multiple single-block continuous anchors (cross-block / discontinuous).
    source_anchor_ids: list[str] = Field(min_length=1, max_length=50)
    confidence: float = Field(ge=0, le=1)

    @field_validator("id", "text")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value

    @field_validator("source_anchor_ids")
    @classmethod
    def reject_blank_anchor_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("source_anchor_ids must not be empty")
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


class CandidateThoughtEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    source_node_id: str = Field(min_length=1, max_length=128)
    target_node_id: str = Field(min_length=1, max_length=128)
    type: ThoughtEdgeType
    label: str | None = Field(default=None, max_length=80)
    source_anchor_ids: list[str] = Field(default_factory=list, max_length=50)
    confidence: float = Field(ge=0, le=1)

    @field_validator("id", "source_node_id", "target_node_id")
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
                raise ValueError("custom edges require a non-blank label")
            self.label = self.label.strip()
        else:
            self.label = None
        return self


class CandidateThoughtModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    note_id: str = Field(min_length=1, max_length=128)
    source_revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    proposed_anchors: list[ProposedSourceAnchor] = Field(default_factory=list, max_length=200)
    nodes: list[CandidateThoughtNode] = Field(default_factory=list, max_length=200)
    edges: list[CandidateThoughtEdge] = Field(default_factory=list, max_length=400)

    @model_validator(mode="after")
    def validate_edge_endpoints_exist(self) -> Self:
        node_ids = {node.id for node in self.nodes}
        for edge in self.edges:
            if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
                raise ValueError("edge endpoints must reference candidate nodes")
        return self
