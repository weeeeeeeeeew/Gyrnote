from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .note import ThoughtNodeType

StructureQueryKind = Literal["unsupported_claims", "shared_assumption", "open_questions"]


class StructureQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: StructureQueryKind


class StructureQueryHit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note_id: str = Field(min_length=1)
    note_title: str = Field(min_length=1)
    node_id: str = Field(min_length=1)
    node_type: ThoughtNodeType
    node_text: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    quotes: list[str] = Field(default_factory=list)


class StructureQueryRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: StructureQueryKind
    hits: list[StructureQueryHit]
