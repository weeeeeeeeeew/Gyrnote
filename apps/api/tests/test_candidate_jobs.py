from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest
from arq.jobs import JobResult, JobStatus
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.candidate_jobs import enqueue_candidate_job_endpoint, get_candidate_job_endpoint
from src.app.schemas.candidate import (
    CandidateCompileRequest,
    CandidateThoughtModel,
    CandidateThoughtNode,
    CompileSourceAnchor,
)
from src.app.schemas.candidate_job import CandidateJobRead
from src.app.services.candidate_jobs import (
    CandidateJobNotFoundError,
    CandidateJobQueueUnavailableError,
    compile_candidate_job,
    enqueue_candidate_compile_job,
    map_arq_job_to_read,
    public_job_error,
    read_candidate_job,
)


def make_request() -> CandidateCompileRequest:
    return CandidateCompileRequest(
        note_id="note-1",
        source_revision=2,
        title="秋招方向",
        source_anchors=[
            CompileSourceAnchor(id="anchor-1", quote="原文片段", block_id="block-1"),
        ],
    )


def make_candidate() -> CandidateThoughtModel:
    return CandidateThoughtModel(
        id="candidate-note-1-2",
        note_id="note-1",
        source_revision=2,
        title="候选",
        nodes=[
            CandidateThoughtNode(
                id="candidate-observation-1",
                type="observation",
                text="原文片段",
                source_anchor_ids=["anchor-1"],
                confidence=0.72,
            )
        ],
        edges=[],
    )


def make_result(*, success: bool, result: object, owner_id: int = 1) -> JobResult:
    now = datetime.now(UTC)
    return JobResult(
        function="compile_candidate_job",
        args=(owner_id, make_request().model_dump(mode="json")),
        kwargs={},
        job_try=1,
        enqueue_time=now,
        score=None,
        job_id="job-1",
        success=success,
        result=result,
        start_time=now,
        finish_time=now,
        queue_name="arq:queue",
    )


def test_schema_requires_candidate_only_when_succeeded() -> None:
    with pytest.raises(ValidationError):
        CandidateJobRead(job_id="job-1", status="succeeded")
    with pytest.raises(ValidationError):
        CandidateJobRead(job_id="job-1", status="queued", candidate=make_candidate())
    with pytest.raises(ValidationError):
        CandidateJobRead(job_id="job-1", status="failed")


def test_map_queued_running_and_owner_isolation() -> None:
    queued = map_arq_job_to_read(
        job_id="job-1",
        owner_id=1,
        status=JobStatus.queued,
        args=(1, {}),
        result_info=None,
    )
    assert queued.status == "queued"
    assert queued.candidate is None

    running = map_arq_job_to_read(
        job_id="job-1",
        owner_id=1,
        status=JobStatus.in_progress,
        args=(1, {}),
        result_info=None,
    )
    assert running.status == "running"

    with pytest.raises(CandidateJobNotFoundError):
        map_arq_job_to_read(
            job_id="job-1",
            owner_id=1,
            status=JobStatus.queued,
            args=(2, {}),
            result_info=None,
        )
    with pytest.raises(CandidateJobNotFoundError):
        map_arq_job_to_read(
            job_id="job-1",
            owner_id=1,
            status=JobStatus.not_found,
            args=(1, {}),
            result_info=None,
        )


def test_map_complete_success_and_failure() -> None:
    succeeded = map_arq_job_to_read(
        job_id="job-1",
        owner_id=1,
        status=JobStatus.complete,
        args=(1, {}),
        result_info=make_result(success=True, result=make_candidate().model_dump(mode="json")),
    )
    assert succeeded.status == "succeeded"
    assert succeeded.candidate is not None
    assert succeeded.candidate.id == "candidate-note-1-2"

    failed = map_arq_job_to_read(
        job_id="job-1",
        owner_id=1,
        status=JobStatus.complete,
        args=(1, {}),
        result_info=make_result(success=False, result=NotImplementedError("compile_candidate_job")),
    )
    assert failed.status == "failed"
    assert failed.candidate is None
    assert "compile_candidate_job" in (failed.error or "")


def test_public_job_error_does_not_use_empty_exception() -> None:
    assert public_job_error(ValueError("LLM provider returned HTTP 502")) == "LLM provider returned HTTP 502"
    assert public_job_error(RuntimeError()) == "RuntimeError"


@pytest.mark.asyncio
async def test_enqueue_returns_queued_without_compiling(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_job = Mock(job_id="job-1")
    fake_pool = Mock()
    fake_pool.enqueue_job = AsyncMock(return_value=fake_job)
    monkeypatch.setattr("src.app.services.candidate_jobs.queue.pool", fake_pool)

    snapshot = await enqueue_candidate_compile_job(1, make_request())
    assert snapshot.status == "queued"
    assert snapshot.job_id == "job-1"
    assert snapshot.candidate is None
    fake_pool.enqueue_job.assert_awaited_once()
    assert fake_pool.enqueue_job.await_args.args[0] == "compile_candidate_job"
    assert fake_pool.enqueue_job.await_args.args[1] == 1


@pytest.mark.asyncio
async def test_enqueue_without_queue_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.app.services.candidate_jobs.queue.pool", None)
    with pytest.raises(CandidateJobQueueUnavailableError):
        await enqueue_candidate_compile_job(1, make_request())


@pytest.mark.asyncio
async def test_endpoint_maps_unavailable_to_503(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.candidate_jobs.enqueue_candidate_compile_job",
        AsyncMock(side_effect=CandidateJobQueueUnavailableError("Queue is not available")),
    )
    with pytest.raises(HTTPException) as error:
        await enqueue_candidate_job_endpoint(make_request(), current_user_dict)
    assert error.value.status_code == 503


@pytest.mark.asyncio
async def test_get_endpoint_maps_foreign_job_to_404(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.candidate_jobs.read_candidate_job",
        AsyncMock(side_effect=CandidateJobNotFoundError("compile job not found")),
    )
    with pytest.raises(HTTPException) as error:
        await get_candidate_job_endpoint("job-1", current_user_dict)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_read_candidate_job_uses_result_info_args(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_job = Mock()
    fake_job.status = AsyncMock(return_value=JobStatus.complete)
    fake_job.info = AsyncMock(return_value=None)
    fake_job.result_info = AsyncMock(
        return_value=make_result(success=True, result=make_candidate().model_dump(mode="json"))
    )
    monkeypatch.setattr("src.app.services.candidate_jobs.queue.pool", Mock())
    monkeypatch.setattr("src.app.services.candidate_jobs.ArqJob", lambda *_args, **_kwargs: fake_job)

    snapshot = await read_candidate_job("job-1", 1)
    assert snapshot.status == "succeeded"
    assert snapshot.candidate is not None


@pytest.mark.asyncio
async def test_compile_candidate_job_returns_candidate_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.app.services.candidate_jobs.compile_candidate_model",
        AsyncMock(return_value=make_candidate()),
    )
    result = await compile_candidate_job({}, 1, make_request().model_dump(mode="json"))
    candidate = CandidateThoughtModel.model_validate(result)
    assert candidate.note_id == "note-1"
    assert candidate.id.startswith("candidate-")
    assert "thought_model" not in result


@pytest.mark.asyncio
async def test_compile_candidate_job_rejects_invalid_payload_before_compile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    compile_mock = AsyncMock()
    monkeypatch.setattr("src.app.services.candidate_jobs.compile_candidate_model", compile_mock)
    with pytest.raises(ValidationError):
        await compile_candidate_job({}, 1, {"note_id": "note-1"})
    compile_mock.assert_not_awaited()
