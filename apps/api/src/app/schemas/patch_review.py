from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PatchReviewStatus = Literal["awaiting_review", "approved", "rejected"]


class PatchReviewStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patch_id: str = Field(min_length=1, max_length=128)
    ops: list[dict[str, Any]] = Field(min_length=1)

    @field_validator("patch_id")
    @classmethod
    def reject_blank_patch_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("patch_id must not be blank")
        return value

    @model_validator(mode="after")
    def reject_thought_model_and_coverage_ops(self) -> Self:
        for op in self.ops:
            if not isinstance(op, dict):
                raise ValueError("each op must be an object")
            if "thought_model" in op or "nodes" in op:
                raise ValueError("ops must not carry ThoughtModel")
            name = op.get("op")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("op type is required")
            if name == "add_node":
                raise ValueError("add_node is not allowed")
        return self


class PatchReviewResumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: str = Field(min_length=1, max_length=32)

    @field_validator("decision")
    @classmethod
    def reject_blank_decision(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("decision must not be blank")
        return value


class PatchReviewRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread_id: str
    patch_id: str
    status: PatchReviewStatus
    ops: list[dict[str, Any]]
