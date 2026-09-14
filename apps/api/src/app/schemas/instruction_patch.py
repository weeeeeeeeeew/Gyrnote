from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .note import PersistedThoughtModel

InstructionOpName = Literal["update_node_text", "delete_node", "move_anchor"]


class InstructionSourceAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    block_id: str = Field(min_length=1, max_length=128)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=0)

    @field_validator("id", "block_id")
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


class UpdateNodeTextOp(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal["update_node_text"]
    node_id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1)

    @field_validator("node_id", "text")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()


class DeleteNodeOp(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal["delete_node"]
    node_id: str = Field(min_length=1, max_length=128)

    @field_validator("node_id")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()


class MoveAnchorOp(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal["move_anchor"]
    anchor_id: str = Field(min_length=1, max_length=128)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(ge=0)

    @field_validator("anchor_id")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def validate_offsets(self) -> Self:
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


InstructionOp = Annotated[
    UpdateNodeTextOp | DeleteNodeOp | MoveAnchorOp,
    Field(discriminator="op"),
]


class InstructionPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1, max_length=2000)
    note_id: str = Field(min_length=1, max_length=128)
    thought_model: PersistedThoughtModel
    source_anchors: list[InstructionSourceAnchor] = Field(default_factory=list, max_length=500)

    @field_validator("instruction", "note_id")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def validate_note_identity(self) -> Self:
        if self.thought_model.note_id != self.note_id:
            raise ValueError("thought_model.note_id does not match note_id")
        return self


class InstructionPatchRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    note_id: str = Field(min_length=1, max_length=128)
    base_model_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=200)
    ops: list[InstructionOp] = Field(min_length=1)

    @model_validator(mode="after")
    def reject_identity_collision_and_coverage_ops(self) -> Self:
        if self.id == self.note_id:
            raise ValueError("patch id must not equal note_id")
        for op in self.ops:
            if getattr(op, "op", None) == "add_node":
                raise ValueError("add_node is not allowed")
        return self
