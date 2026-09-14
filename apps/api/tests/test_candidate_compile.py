import uuid as uuid_pkg
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from src.app.schemas.candidate import (
    CandidateCompileRequest,
    CandidateThoughtEdge,
    CandidateThoughtModel,
    CandidateThoughtNode,
    CompileNoteBlock,
    CompileSourceAnchor,
)
from src.app.services.candidate_compile import (
    LLMResponseInvalidError,
    build_compile_messages,
    compile_candidate_model,
    ensure_candidate_anchors_are_known,
    locate_quote_in_block,
    materialize_proposed_anchors,
    parse_llm_json_content,
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


def make_candidate(*, anchor_ids: list[str] | None = None) -> CandidateThoughtModel:
    ids = anchor_ids if anchor_ids is not None else ["anchor-1"]
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
                source_anchor_ids=ids,
                confidence=0.72,
            )
        ],
        edges=[],
    )


def test_candidate_node_schema_rejects_blank_anchor_and_invalid_confidence() -> None:
    with pytest.raises(ValidationError):
        CandidateThoughtNode(
            id="n1",
            type="observation",
            text="x",
            source_anchor_ids=[],
            confidence=0.5,
        )
    with pytest.raises(ValidationError):
        CandidateThoughtNode(
            id="n1",
            type="observation",
            text="x",
            source_anchor_ids=[""],
            confidence=0.5,
        )
    with pytest.raises(ValidationError):
        CandidateThoughtNode(
            id="n1",
            type="observation",
            text="x",
            source_anchor_ids=["anchor-1"],
            confidence=1.5,
        )


def test_candidate_model_rejects_edge_with_missing_endpoint() -> None:
    with pytest.raises(ValidationError, match="edge endpoints"):
        CandidateThoughtModel(
            id="c1",
            note_id="note-1",
            source_revision=1,
            title="候选",
            nodes=[
                CandidateThoughtNode(
                    id="n1",
                    type="claim",
                    text="主张",
                    source_anchor_ids=["anchor-1"],
                    confidence=0.5,
                )
            ],
            edges=[
                CandidateThoughtEdge(
                    id="e1",
                    source_node_id="n1",
                    target_node_id="missing",
                    type="supports",
                    source_anchor_ids=["anchor-1"],
                    confidence=0.4,
                )
            ],
        )


def test_parse_llm_json_content_strips_markdown_fence() -> None:
    payload = parse_llm_json_content(
        """```json
{"id": "c1", "note_id": "note-1"}
```"""
    )
    assert payload["id"] == "c1"


def test_build_compile_messages_includes_anchor_ids() -> None:
    messages = build_compile_messages(make_request())
    assert messages[0]["role"] == "system"
    assert "anchor-1" in messages[1]["content"]
    assert "原文片段" in messages[1]["content"]
    assert "user_anchors" in messages[1]["content"]
    assert "note_blocks" in messages[1]["content"]


def test_build_compile_messages_marks_initial_compile_and_forbids_quote_copy() -> None:
    messages = build_compile_messages(make_request())
    system = messages[0]["content"]
    user = messages[1]["content"]

    assert "INITIAL" in system or "initial" in system.lower()
    assert "mode: initial_compile" in user
    assert "not quote copy" in user.lower() or "do not copy quote" in user.lower()
    assert "Nodes:" in user and "Edges:" in user
    assert "proposed_anchors" in system
    assert "source_anchor_ids" in system
    assert "multi-id" in user.lower() or "multiple" in user.lower()


def test_build_compile_messages_includes_note_blocks() -> None:
    request = CandidateCompileRequest(
        note_id="note-1",
        source_revision=1,
        title="全文编译",
        source_anchors=[],
        note_blocks=[CompileNoteBlock(id="block-1", text="如果 ThoughtNode 不能回到原文")],
    )
    user = build_compile_messages(request)[1]["content"]
    assert "block-1" in user
    assert "ThoughtNode" in user


@pytest.mark.asyncio
async def test_compile_returns_empty_candidate_without_blocks_or_anchors() -> None:
    result = await compile_candidate_model(
        CandidateCompileRequest(
            note_id="note-1",
            source_revision=1,
            title="空输入",
            source_anchors=[],
            note_blocks=[],
        )
    )
    assert result.nodes == []
    assert result.edges == []
    assert result.proposed_anchors == []
    assert result.source_revision == 1


@pytest.mark.asyncio
async def test_compile_candidate_model_materializes_proposed_anchors_from_blocks() -> None:
    request = CandidateCompileRequest(
        note_id="note-1",
        source_revision=3,
        title="全文",
        source_anchors=[],
        note_blocks=[CompileNoteBlock(id="block-1", text="原文片段可以定位")],
    )
    llm_json = {
        "id": "ignored",
        "note_id": "wrong",
        "source_revision": 1,
        "title": "LLM 候选",
        "proposed_anchors": [
            {"id": "proposed-1", "block_id": "block-1", "quote": "原文片段"},
        ],
        "nodes": [
            {
                "id": "n1",
                "type": "observation",
                "text": "可定位到原文",
                "source_anchor_ids": ["proposed-1"],
                "confidence": 0.7,
            }
        ],
        "edges": [],
    }

    with patch(
        "src.app.services.candidate_compile.call_openai_compatible_chat",
        new=AsyncMock(return_value=json_dumps(llm_json)),
    ):
        result = await compile_candidate_model(request)

    assert result.note_id == "note-1"
    assert result.source_revision == 3
    assert result.proposed_anchors[0].id != "proposed-1"
    uuid_pkg.UUID(result.proposed_anchors[0].id)
    assert result.proposed_anchors[0].start_offset == 0
    assert result.proposed_anchors[0].end_offset == len("原文片段")
    assert result.nodes[0].source_anchor_ids == [result.proposed_anchors[0].id]


@pytest.mark.asyncio
async def test_compile_candidate_model_allows_multi_anchor_cross_block_node() -> None:
    request = CandidateCompileRequest(
        note_id="note-1",
        source_revision=1,
        title="跨段证据",
        source_anchors=[],
        note_blocks=[
            CompileNoteBlock(id="block-1", text="条件：缺少反馈回路"),
            CompileNoteBlock(id="block-2", text="结果：模型无法校正"),
        ],
    )
    llm_json = {
        "id": "ignored",
        "note_id": "wrong",
        "source_revision": 9,
        "title": "LLM 候选",
        "proposed_anchors": [
            {"id": "proposed-a", "block_id": "block-1", "quote": "缺少反馈回路"},
            {"id": "proposed-b", "block_id": "block-2", "quote": "模型无法校正"},
        ],
        "nodes": [
            {
                "id": "n1",
                "type": "claim",
                "text": "缺反馈导致无法校正",
                "source_anchor_ids": ["proposed-a", "proposed-b"],
                "confidence": 0.66,
            }
        ],
        "edges": [],
    }

    with patch(
        "src.app.services.candidate_compile.call_openai_compatible_chat",
        new=AsyncMock(return_value=json_dumps(llm_json)),
    ):
        result = await compile_candidate_model(request)

    assert len(result.proposed_anchors) == 2
    for anchor in result.proposed_anchors:
        uuid_pkg.UUID(anchor.id)
    assert result.nodes[0].source_anchor_ids == [anchor.id for anchor in result.proposed_anchors]


def test_locate_quote_in_block_learning_checkpoint() -> None:
    assert locate_quote_in_block("abc原文片段xyz", "原文片段") == (3, 7)

    with pytest.raises(LLMResponseInvalidError, match="blank quote"):
        locate_quote_in_block("abc", "   ")

    with pytest.raises(LLMResponseInvalidError, match="quote not found in block"):
        locate_quote_in_block("abc", "不存在")


def test_materialize_proposed_anchors_rejects_unknown_block() -> None:
    with pytest.raises(LLMResponseInvalidError, match="unknown proposed_anchor block_id"):
        materialize_proposed_anchors(
            [{"id": "p1", "block_id": "missing", "quote": "x"}],
            [CompileNoteBlock(id="block-1", text="x")],
        )


@pytest.mark.asyncio
async def test_compile_candidate_model_uses_llm_and_validates_shape() -> None:
    request = make_request()
    llm_json = {
        "id": "ignored",
        "note_id": "wrong-note",
        "source_revision": 99,
        "title": "LLM 候选",
        "nodes": [
            {
                "id": "candidate-observation-1",
                "type": "observation",
                "text": "原文片段",
                "source_anchor_ids": ["anchor-1"],
                "confidence": 0.8,
            }
        ],
        "edges": [],
    }

    with (
        patch(
            "src.app.services.candidate_compile.call_openai_compatible_chat",
            new=AsyncMock(return_value=json_dumps(llm_json)),
        ),
        patch(
            "src.app.services.candidate_compile.ensure_candidate_anchors_are_known",
            side_effect=lambda candidate, _anchors: candidate,
        ),
    ):
        result = await compile_candidate_model(request)

    assert result.note_id == "note-1"
    assert result.source_revision == 2
    assert result.nodes[0].source_anchor_ids == ["anchor-1"]


def test_ensure_candidate_anchors_are_known_accepts_known_anchor() -> None:
    candidate = make_candidate(anchor_ids=["anchor-1"])
    result = ensure_candidate_anchors_are_known(candidate, make_request().source_anchors)
    assert result == candidate


def test_ensure_candidate_anchors_are_known_rejects_unknown_anchor() -> None:
    candidate = make_candidate(anchor_ids=["anchor-unknown"])
    with pytest.raises(LLMResponseInvalidError, match="unknown source_anchor_id"):
        ensure_candidate_anchors_are_known(candidate, make_request().source_anchors)


def test_ensure_candidate_anchors_are_known_rejects_unknown_among_multi() -> None:
    candidate = make_candidate(anchor_ids=["anchor-1", "anchor-unknown"])
    with pytest.raises(LLMResponseInvalidError, match="unknown source_anchor_id"):
        ensure_candidate_anchors_are_known(candidate, make_request().source_anchors)


def json_dumps(value: dict) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)
