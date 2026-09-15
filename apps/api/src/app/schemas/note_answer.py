import uuid as uuid_pkg
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .graph_rag import GraphRagEmptyReason, GraphRagNodeHit, GraphRagPassageHit

NoteAnswerRefuseReason = GraphRagEmptyReason | Literal["no_passages", "insufficient_evidence"]


class NoteAnswerTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def strip_content(self) -> Self:
        text = self.content.strip()
        if not text:
            raise ValueError("content must not be blank")
        self.content = text
        return self


class NoteAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(default=5, ge=1, le=20)
    node_k: int = Field(default=5, ge=1, le=20)
    note_ids: list[uuid_pkg.UUID] = Field(default_factory=list)
    history: list[NoteAnswerTurn] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def strip_query(self) -> Self:
        text = self.query.strip()
        if not text:
            raise ValueError("query must not be blank")
        self.query = text
        return self


class NoteAnswerRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1)
    grounded: bool
    refuse_reason: NoteAnswerRefuseReason | None = None
    cited_block_ids: list[str] = Field(default_factory=list)
    nodes: list[GraphRagNodeHit] = Field(default_factory=list)
    hits: list[GraphRagPassageHit] = Field(default_factory=list)
