import uuid as uuid_pkg
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NoteChunkRecallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str | None = None
    query_embedding: list[float] | None = Field(default=None, min_length=1, max_length=4096)
    k: int = Field(default=5, ge=1, le=20)
    note_ids: list[uuid_pkg.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_exactly_one_query(self) -> Self:
        text = self.query.strip() if isinstance(self.query, str) else ""
        has_text = bool(text)
        has_vector = self.query_embedding is not None
        if has_text == has_vector:
            raise ValueError("provide exactly one of query or query_embedding")
        if has_text:
            self.query = text
        return self


class NoteChunkHit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note_id: str = Field(min_length=1)
    note_title: str = Field(min_length=1)
    block_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    score: float


class NoteChunkRecallRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hits: list[NoteChunkHit]
