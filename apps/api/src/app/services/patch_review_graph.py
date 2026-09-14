"""LangGraph HITL for ModelPatch review. Does not own ThoughtModel."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class PatchReviewState(TypedDict):
    patch_id: str
    ops: list[dict[str, Any]]
    status: str
    decision: NotRequired[str]


def present_for_review(state: PatchReviewState) -> dict[str, str]:
    # Resume restarts this node: keep everything before interrupt() idempotent.
    decision = interrupt({"patch_id": state["patch_id"], "ops": state["ops"]})
    if not isinstance(decision, str):
        raise TypeError("review decision must be a string")
    return {"decision": decision}


def route_after_review(state: PatchReviewState) -> Literal["record_approved", "record_rejected"]:
    """Route the human decision. Does not apply ThoughtModel."""
    decision = state.get("decision")
    if decision == "approve":
        return "record_approved"
    if decision == "reject":
        return "record_rejected"
    raise ValueError(f"invalid review decision: {decision!r}")


def record_approved(_state: PatchReviewState) -> dict[str, str]:
    return {"status": "approved"}


def record_rejected(_state: PatchReviewState) -> dict[str, str]:
    return {"status": "rejected"}


def build_patch_review_graph(
    checkpointer: InMemorySaver | None = None,
) -> Any:
    saver = checkpointer if checkpointer is not None else InMemorySaver()
    # StateGraph generics from langgraph 1.2 don't accept our TypedDict nodes under mypy.
    builder: Any = StateGraph(PatchReviewState)
    builder.add_node("present_for_review", present_for_review)
    builder.add_node("record_approved", record_approved)
    builder.add_node("record_rejected", record_rejected)
    builder.add_edge(START, "present_for_review")
    builder.add_conditional_edges(
        "present_for_review",
        route_after_review,
        {
            "record_approved": "record_approved",
            "record_rejected": "record_rejected",
        },
    )
    builder.add_edge("record_approved", END)
    builder.add_edge("record_rejected", END)
    return builder.compile(checkpointer=saver)
