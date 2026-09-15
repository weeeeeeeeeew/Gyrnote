"""Enqueue candidate compile jobs. Never writes confirmed ThoughtModel or notes."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

from arq.jobs import Job as ArqJob
from arq.jobs import JobResult, JobStatus
from pydantic import ValidationError

from ..core.utils import queue
from ..schemas.candidate import CandidateCompileRequest, CandidateThoughtModel
from ..schemas.candidate_job import CandidateJobRead
from .candidate_compile import compile_candidate_model

COMPILE_CANDIDATE_JOB_NAME = "compile_candidate_job"


class CandidateJobError(Exception):
    pass


class CandidateJobNotFoundError(CandidateJobError):
    pass


class CandidateJobQueueUnavailableError(CandidateJobError):
    pass


class CandidateJobInvalidError(CandidateJobError):
    pass


def public_job_error(result: object) -> str:
    if isinstance(result, BaseException):
        message = str(result).strip() or type(result).__name__
        return message[:200]
    if isinstance(result, str) and result.strip():
        return result.strip()[:200]
    return "candidate compile job failed"


def map_arq_job_to_read(
    *,
    job_id: str,
    owner_id: int,
    status: JobStatus,
    args: Sequence[Any] | None,
    result_info: JobResult | None,
) -> CandidateJobRead:
    if status is JobStatus.not_found:
        raise CandidateJobNotFoundError("compile job not found")
    if not args or args[0] != owner_id:
        raise CandidateJobNotFoundError("compile job not found")
    if status in {JobStatus.queued, JobStatus.deferred}:
        return CandidateJobRead(job_id=job_id, status="queued")
    if status is JobStatus.in_progress:
        return CandidateJobRead(job_id=job_id, status="running")
    if status is JobStatus.complete:
        if result_info is None:
            raise CandidateJobInvalidError("complete job is missing result")
        if result_info.success:
            try:
                candidate = CandidateThoughtModel.model_validate(result_info.result)
            except ValidationError as exc:
                raise CandidateJobInvalidError("complete job result is not a candidate") from exc
            return CandidateJobRead(job_id=job_id, status="succeeded", candidate=candidate)
        return CandidateJobRead(job_id=job_id, status="failed", error=public_job_error(result_info.result))
    raise CandidateJobNotFoundError("compile job not found")


async def enqueue_candidate_compile_job(
    owner_id: int,
    request: CandidateCompileRequest,
    llm_override: dict[str, Any] | None = None,
) -> CandidateJobRead:
    if queue.pool is None:
        raise CandidateJobQueueUnavailableError("Queue is not available")
    try:
        job = await asyncio.wait_for(
            queue.pool.enqueue_job(
                COMPILE_CANDIDATE_JOB_NAME,
                owner_id,
                request.model_dump(mode="json"),
                llm_override,
            ),
            timeout=5,
        )
    except TimeoutError as exc:
        raise CandidateJobQueueUnavailableError("Queue enqueue timed out") from exc
    except OSError as exc:
        raise CandidateJobQueueUnavailableError("Queue is not available") from exc
    if job is None:
        raise CandidateJobQueueUnavailableError("Failed to enqueue compile job")
    return CandidateJobRead(job_id=job.job_id, status="queued")


async def read_candidate_job(job_id: str, owner_id: int) -> CandidateJobRead:
    if queue.pool is None:
        raise CandidateJobQueueUnavailableError("Queue is not available")
    job = ArqJob(job_id, queue.pool)
    status = await job.status()
    info = await job.info()
    result_info = await job.result_info()
    args = info.args if info is not None else (result_info.args if result_info is not None else None)
    return map_arq_job_to_read(
        job_id=job_id,
        owner_id=owner_id,
        status=status,
        args=args,
        result_info=result_info,
    )


async def compile_candidate_job(
    ctx: dict[str, Any],
    owner_id: int,
    payload: dict[str, Any],
    llm_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """ARQ worker: run candidate compile and return a candidate dump. Do not write notes.

    Inputs: ARQ ctx, owner_id, CandidateCompileRequest JSON, optional llm override.
    Output: CandidateThoughtModel.model_dump(mode="json").
    Fail closed on invalid payload or compile errors. Never persist confirmed ThoughtModel.
    Never log llm_override (may hold secrets).
    """
    _ = ctx, owner_id
    request = CandidateCompileRequest.model_validate(payload)
    candidate = await compile_candidate_model(request, llm_override=llm_override)
    return candidate.model_dump(mode="json")
