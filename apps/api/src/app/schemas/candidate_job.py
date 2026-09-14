from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .candidate import CandidateCompileRequest, CandidateThoughtModel

CandidateJobStatus = Literal["queued", "running", "succeeded", "failed"]


class CandidateJobEnqueueRequest(CandidateCompileRequest):
    """Same compile payload; the job is a candidate compile, never a confirmed model write."""


class CandidateJobRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(min_length=1, max_length=128)
    status: CandidateJobStatus
    candidate: CandidateThoughtModel | None = None
    error: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_status_payload(self) -> Self:
        if self.status == "succeeded":
            if self.candidate is None:
                raise ValueError("succeeded job must include a candidate")
            if self.error is not None:
                raise ValueError("succeeded job must not include an error")
        else:
            if self.candidate is not None:
                raise ValueError("non-succeeded job must not include a candidate")
        if self.status != "failed" and self.error is not None:
            raise ValueError("only failed jobs may include an error")
        if self.status == "failed" and (self.error is None or not self.error.strip()):
            raise ValueError("failed job must include an error")
        return self
