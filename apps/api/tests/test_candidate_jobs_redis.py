"""Real Redis + in-process ARQ worker. Skips when Redis is down. Mocks LLM compile."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from arq.connections import RedisSettings, create_pool
from arq.worker import Worker

from src.app.services.candidate_jobs import (
    compile_candidate_job,
    enqueue_candidate_compile_job,
    read_candidate_job,
)
from tests.test_candidate_jobs import make_candidate, make_request

QUEUE_NAME = "arq:queue:pytest-candidate"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_redis_worker_returns_candidate_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    try:
        pool = await create_pool(
            RedisSettings(host="127.0.0.1", port=6379),
            default_queue_name=QUEUE_NAME,
        )
        await pool.ping()
    except Exception as exc:
        pytest.skip(f"Redis queue is not available ({type(exc).__name__})")

    monkeypatch.setattr("src.app.services.candidate_jobs.queue.pool", pool)
    monkeypatch.setattr(
        "src.app.services.candidate_jobs.compile_candidate_model",
        AsyncMock(return_value=make_candidate()),
    )
    try:
        snapshot = await enqueue_candidate_compile_job(1, make_request())
        assert snapshot.status == "queued"
        assert snapshot.candidate is None

        worker = Worker(
            functions=[compile_candidate_job],
            redis_pool=pool,
            queue_name=QUEUE_NAME,
            burst=True,
            poll_delay=0,
            handle_signals=False,
            max_tries=1,
        )
        await worker.async_run()

        result = await read_candidate_job(snapshot.job_id, 1)
        assert result.status == "succeeded"
        assert result.candidate is not None
        assert result.candidate.note_id == "note-1"
        assert result.error is None
    finally:
        await pool.aclose()
