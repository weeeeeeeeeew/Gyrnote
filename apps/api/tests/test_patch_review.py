import pytest
from pydantic import ValidationError

from src.app.api.v1.patch_reviews import resume_patch_review_endpoint, start_patch_review_endpoint
from src.app.schemas.patch_review import PatchReviewResumeRequest, PatchReviewStartRequest
from src.app.services.patch_review import (
    PatchReviewConflictError,
    PatchReviewDecisionError,
    PatchReviewNotFoundError,
    reset_patch_review_runtime,
    resume_patch_review,
    start_patch_review,
)


def _ops() -> list[dict[str, object]]:
    return [{"op": "move_anchor", "anchorId": "a1", "startOffset": 2, "endOffset": 6}]


@pytest.fixture(autouse=True)
def _reset_runtime() -> None:
    reset_patch_review_runtime()


def test_start_schema_rejects_add_node_and_thought_model() -> None:
    with pytest.raises(ValidationError, match="add_node"):
        PatchReviewStartRequest(patch_id="patch-1", ops=[{"op": "add_node", "nodeId": "n1"}])
    with pytest.raises(ValidationError, match="ThoughtModel"):
        PatchReviewStartRequest(
            patch_id="patch-1",
            ops=[{"op": "update_node_text", "nodeId": "n1", "text": "x", "nodes": []}],
        )


def test_start_interrupts_without_thought_model() -> None:
    snapshot = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)

    assert snapshot.status == "awaiting_review"
    assert snapshot.patch_id == "anchor-patch-model-1"
    assert snapshot.ops[0]["op"] == "move_anchor"
    assert snapshot.thread_id
    assert not hasattr(snapshot, "thought_model")
    assert "nodes" not in snapshot.ops[0]


@pytest.mark.asyncio
async def test_start_endpoint_returns_awaiting_review() -> None:
    payload = PatchReviewStartRequest(patch_id="patch-1", ops=_ops())
    result = await start_patch_review_endpoint(payload, {"id": 7})

    assert result.status == "awaiting_review"
    assert result.patch_id == "patch-1"
    assert result.thread_id


def test_resume_approve_records_approved_without_thought_model() -> None:
    started = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)

    result = resume_patch_review(started.thread_id, "approve", owner_id=7)

    assert result.status == "approved"
    assert result.patch_id == "anchor-patch-model-1"
    assert result.thread_id == started.thread_id
    assert not hasattr(result, "thought_model")


def test_resume_reject_records_rejected() -> None:
    started = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)

    result = resume_patch_review(started.thread_id, "reject", owner_id=7)

    assert result.status == "rejected"
    assert result.status != "approved"


def test_resume_unknown_decision_fails_closed() -> None:
    started = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)

    with pytest.raises(PatchReviewDecisionError):
        resume_patch_review(started.thread_id, "maybe", owner_id=7)


def test_resume_unknown_or_foreign_thread_is_not_found() -> None:
    started = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)

    with pytest.raises(PatchReviewNotFoundError):
        resume_patch_review("missing-thread", "approve", owner_id=7)
    with pytest.raises(PatchReviewNotFoundError):
        resume_patch_review(started.thread_id, "approve", owner_id=99)


def test_resume_finished_thread_conflicts() -> None:
    started = start_patch_review("anchor-patch-model-1", _ops(), owner_id=7)
    resume_patch_review(started.thread_id, "approve", owner_id=7)

    with pytest.raises(PatchReviewConflictError):
        resume_patch_review(started.thread_id, "reject", owner_id=7)


@pytest.mark.asyncio
async def test_resume_endpoint_approve() -> None:
    started = await start_patch_review_endpoint(
        PatchReviewStartRequest(patch_id="patch-1", ops=_ops()),
        {"id": 7},
    )
    result = await resume_patch_review_endpoint(
        started.thread_id,
        PatchReviewResumeRequest(decision="approve"),
        {"id": 7},
    )

    assert result.status == "approved"
    assert result.thread_id == started.thread_id
