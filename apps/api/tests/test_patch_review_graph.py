from typing import Any

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from src.app.services.patch_review_graph import build_patch_review_graph


def _config(thread_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": thread_id}}


def _start_input() -> dict[str, Any]:
    return {
        "patch_id": "anchor-patch-model-1",
        "ops": [{"op": "move_anchor", "anchorId": "a1", "startOffset": 2, "endOffset": 6}],
        "status": "awaiting_review",
    }


def test_start_interrupts_with_patch_payload_and_does_not_finish() -> None:
    graph = build_patch_review_graph(InMemorySaver())
    result = graph.invoke(_start_input(), _config("thread-start"))

    interrupts = result.get("__interrupt__")
    assert interrupts is not None
    payload = interrupts[0].value
    assert payload["patch_id"] == "anchor-patch-model-1"
    assert payload["ops"][0]["op"] == "move_anchor"
    assert "nodes" not in result
    assert result.get("status") != "approved"


def test_resume_approve_records_approved_without_thought_model() -> None:
    graph = build_patch_review_graph(InMemorySaver())
    config = _config("thread-approve")
    graph.invoke(_start_input(), config)

    result = graph.invoke(Command(resume="approve"), config)

    assert "__interrupt__" not in result
    assert result["status"] == "approved"
    assert result["patch_id"] == "anchor-patch-model-1"
    assert "thought_model" not in result


def test_resume_reject_records_rejected() -> None:
    graph = build_patch_review_graph(InMemorySaver())
    config = _config("thread-reject")
    graph.invoke(_start_input(), config)

    result = graph.invoke(Command(resume="reject"), config)

    assert result["status"] == "rejected"
    assert result.get("status") != "approved"


def test_resume_with_unknown_decision_fails_closed() -> None:
    graph = build_patch_review_graph(InMemorySaver())
    config = _config("thread-invalid")
    graph.invoke(_start_input(), config)

    with pytest.raises(ValueError, match="invalid review decision"):
        graph.invoke(Command(resume="maybe"), config)
