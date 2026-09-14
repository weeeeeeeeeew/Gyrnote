"""HTTP-facing ModelPatch review sessions. Does not own ThoughtModel."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from .patch_review_graph import build_patch_review_graph

PatchReviewStatus = Literal["awaiting_review", "approved", "rejected"]


class PatchReviewError(Exception):
    """Base error for review sessions."""


class PatchReviewNotFoundError(PatchReviewError):
    """Thread missing or not owned by the caller. Do not leak existence."""


class PatchReviewDecisionError(PatchReviewError):
    """Decision is not approve/reject. Fail closed."""


class PatchReviewConflictError(PatchReviewError):
    """Thread is no longer awaiting review."""


class PatchReviewInvalidOpsError(PatchReviewError):
    """Ops are empty, carry ThoughtModel, or try to cover the note with add_node."""


@dataclass(frozen=True, slots=True)
class PatchReviewSnapshot:
    thread_id: str
    patch_id: str
    status: PatchReviewStatus
    ops: list[dict[str, Any]]


_graph: Any | None = None
_thread_owners: dict[str, int] = {}


def reset_patch_review_runtime() -> None:
    """Drop the process-local graph and owner map. Tests only."""
    global _graph, _thread_owners
    _graph = None
    _thread_owners = {}


def _get_graph() -> Any:
    global _graph
    if _graph is None:
        _graph = build_patch_review_graph(InMemorySaver())
    return _graph


def _config(thread_id: str) -> dict[str, dict[str, str]]:
    return {"configurable": {"thread_id": thread_id}}


def snapshot_from_graph_result(thread_id: str, result: dict[str, Any]) -> PatchReviewSnapshot:
    """Map a LangGraph invoke result to an HTTP snapshot. Never copies ThoughtModel."""
    interrupts = result.get("__interrupt__")
    if interrupts:
        payload = interrupts[0].value
        if not isinstance(payload, dict):
            raise PatchReviewError("interrupt payload must be an object")
        patch_id = payload.get("patch_id")
        ops = payload.get("ops")
        if not isinstance(patch_id, str) or not isinstance(ops, list):
            raise PatchReviewError("interrupt payload missing patch_id or ops")
        return PatchReviewSnapshot(
            thread_id=thread_id,
            patch_id=patch_id,
            status="awaiting_review",
            ops=[dict(op) for op in ops if isinstance(op, dict)],
        )

    status = result.get("status")
    patch_id = result.get("patch_id")
    ops = result.get("ops")
    if status not in ("awaiting_review", "approved", "rejected"):
        raise PatchReviewError(f"unexpected review status: {status!r}")
    if not isinstance(patch_id, str):
        raise PatchReviewError("graph result missing patch_id")
    if "thought_model" in result or "nodes" in result:
        raise PatchReviewError("graph result must not include ThoughtModel")
    plain_ops = [dict(op) for op in ops if isinstance(op, dict)] if isinstance(ops, list) else []
    return PatchReviewSnapshot(
        thread_id=thread_id,
        patch_id=patch_id,
        status=status,
        ops=plain_ops,
    )


def start_patch_review(
    patch_id: str,
    ops: list[dict[str, Any]],
    *,
    owner_id: int,
) -> PatchReviewSnapshot:
    """Start a review thread and interrupt. Does not apply ThoughtModel."""
    if not patch_id.strip():
        raise PatchReviewInvalidOpsError("patch_id must not be blank")
    if not ops:
        raise PatchReviewInvalidOpsError("ops must not be empty")
    for op in ops:
        if not isinstance(op, dict):
            raise PatchReviewInvalidOpsError("each op must be an object")
        if "thought_model" in op or "nodes" in op:
            raise PatchReviewInvalidOpsError("ops must not carry ThoughtModel")
        if op.get("op") == "add_node":
            raise PatchReviewInvalidOpsError("add_node is not allowed")

    thread_id = str(uuid4())
    _thread_owners[thread_id] = owner_id
    result = _get_graph().invoke(
        {"patch_id": patch_id, "ops": ops, "status": "awaiting_review"},
        _config(thread_id),
    )
    snapshot = snapshot_from_graph_result(thread_id, result)
    if snapshot.status != "awaiting_review":
        raise PatchReviewError("start must interrupt for review")
    return snapshot


def resume_patch_review(
    thread_id: str,
    decision: str,
    *,
    owner_id: int,
) -> PatchReviewSnapshot:
    """Resume a paused review with approve/reject. Does not apply ThoughtModel.

    Inputs: thread_id from start_patch_review, decision, owner_id of the caller.
    Output: snapshot whose status is approved or rejected.
    Failures:
    - unknown thread or other user's thread → PatchReviewNotFoundError
    - thread already approved/rejected → PatchReviewConflictError
    - decision not approve/reject → PatchReviewDecisionError
    Use the existing compiled graph, same thread_id, and Command(resume=...).
    snapshot_from_graph_result maps the invoke result.
    """
    # 1. decision 校验
    if decision not in ("approve", "reject"):
        raise PatchReviewDecisionError(f"unexpected decision: {decision!r}")

    # 2. thread 归属校验
    if thread_id not in _thread_owners or _thread_owners[thread_id] != owner_id:
        raise PatchReviewNotFoundError(f"thread_id {thread_id!r} not found or not owned by {owner_id}")

    # 3. 读当前状态，已结束 → Conflict
    state = _get_graph().get_state(_config(thread_id))
    if state.values.get("status") in ("approved", "rejected"):
        raise PatchReviewConflictError(f"review thread {thread_id!r} already finished")

    # 4. invoke 恢复
    result = _get_graph().invoke(Command(resume=decision), _config(thread_id))

    # 5. snapshot
    snapshot = snapshot_from_graph_result(thread_id, result)

    # 6. 最终 status 校验
    if snapshot.status not in ("approved", "rejected"):
        raise PatchReviewDecisionError(f"unexpected review status: {snapshot.status!r}")

    return snapshot
