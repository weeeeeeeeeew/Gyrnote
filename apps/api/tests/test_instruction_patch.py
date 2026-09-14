from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.app.api.v1.instruction_patches import compile_instruction_patch_endpoint
from src.app.schemas.instruction_patch import (
    DeleteNodeOp,
    InstructionPatchRequest,
    MoveAnchorOp,
    UpdateNodeTextOp,
)
from src.app.schemas.note import PersistedThoughtModel, PersistedThoughtNode
from src.app.services.instruction_patch import (
    InstructionPatchInvalidError,
    InstructionPatchNotConfiguredError,
    build_instruction_patch,
    coerce_instruction_op,
    compile_instruction_patch,
    parse_instruction_tool_calls,
)


def sample_request(**updates: object) -> InstructionPatchRequest:
    payload = {
        "instruction": "把论点改成结构必须回到笔记",
        "note_id": "note-1",
        "thought_model": PersistedThoughtModel(
            id="model-1",
            note_id="note-1",
            version=2,
            title="原文笔记",
            nodes=[
                PersistedThoughtNode(
                    id="n1",
                    type="claim",
                    text="旧论点",
                    origin="user_created",
                    explicitness="explicit",
                    review_status="confirmed",
                ),
                PersistedThoughtNode(
                    id="n-lock",
                    type="claim",
                    text="已锁定",
                    origin="user_created",
                    explicitness="explicit",
                    review_status="locked",
                ),
            ],
            edges=[],
        ),
        "source_anchors": [
            {"id": "a1", "block_id": "b1", "start_offset": 0, "end_offset": 2},
        ],
    }
    payload.update(updates)
    return InstructionPatchRequest.model_validate(payload)


def test_schema_rejects_blank_instruction_mismatch_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        sample_request(instruction="   ")
    with pytest.raises(ValidationError):
        sample_request(note_id="other-note")
    dumped = sample_request().model_dump(mode="json")
    with pytest.raises(ValidationError):
        InstructionPatchRequest.model_validate({**dumped, "foo": 1})


def test_build_instruction_patch_assigns_distinct_id_and_keeps_ops() -> None:
    request = sample_request()
    patch = build_instruction_patch(
        request,
        [UpdateNodeTextOp(op="update_node_text", node_id="n1", text="结构必须回到笔记")],
    )
    assert patch.id != request.thought_model.id
    assert patch.note_id == "note-1"
    assert patch.base_model_version == 2
    assert patch.ops[0].op == "update_node_text"
    assert patch.ops[0].node_id == "n1"


def test_build_instruction_patch_rejects_locked_unknown_and_empty() -> None:
    request = sample_request()
    with pytest.raises(ValueError, match="locked"):
        build_instruction_patch(
            request,
            [DeleteNodeOp(op="delete_node", node_id="n-lock")],
        )
    with pytest.raises(ValueError, match="unknown node"):
        build_instruction_patch(
            request,
            [UpdateNodeTextOp(op="update_node_text", node_id="missing", text="新")],
        )
    with pytest.raises(ValueError, match="at least one"):
        build_instruction_patch(request, [])
    with pytest.raises(ValueError, match="unknown anchor"):
        build_instruction_patch(
            request,
            [MoveAnchorOp(op="move_anchor", anchor_id="missing", start_offset=0, end_offset=1)],
        )


def test_build_instruction_patch_avoids_model_id_collision() -> None:
    request = sample_request()
    colliding = request.thought_model.model_copy(update={"id": "patch-nl-note-1-v2"})
    request = sample_request(thought_model=colliding)
    patch = build_instruction_patch(
        request,
        [DeleteNodeOp(op="delete_node", node_id="n1")],
    )
    assert patch.id != request.thought_model.id
    assert patch.id.endswith("-candidate")


def test_coerce_instruction_op_rejects_add_node() -> None:
    with pytest.raises(InstructionPatchInvalidError, match="add_node"):
        coerce_instruction_op({"op": "add_node", "text": "覆盖全文"})


@pytest.mark.asyncio
async def test_compile_instruction_patch_uses_injected_parse() -> None:
    request = sample_request()

    async def fake_chat(_messages: list[dict[str, str]], _tools: list[dict[str, object]]) -> object:
        return {"choices": []}

    def fake_parse(_payload: object) -> list[UpdateNodeTextOp]:
        return [UpdateNodeTextOp(op="update_node_text", node_id="n1", text="结构必须回到笔记")]

    patch = await compile_instruction_patch(request, parse_tools=fake_parse, chat_with_tools=fake_chat)
    assert patch.ops[0].text == "结构必须回到笔记"
    assert patch.id != request.thought_model.id


@pytest.mark.asyncio
async def test_compile_without_parse_injection_rejects_empty_envelope() -> None:
    async def fake_chat(_messages: list[dict[str, str]], _tools: list[dict[str, object]]) -> object:
        return {"choices": []}

    with pytest.raises(InstructionPatchInvalidError, match="envelope"):
        await compile_instruction_patch(sample_request(), chat_with_tools=fake_chat)


@pytest.mark.asyncio
async def test_compile_uses_real_parse_on_tool_calls() -> None:
    async def fake_chat(_messages: list[dict[str, str]], _tools: list[dict[str, object]]) -> object:
        return {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "type": "function",
                                "function": {
                                    "name": "update_node_text",
                                    "arguments": '{"node_id":"n1","text":"结构必须回到笔记"}',
                                },
                            }
                        ]
                    }
                }
            ]
        }

    patch = await compile_instruction_patch(sample_request(), chat_with_tools=fake_chat)
    assert patch.ops[0].op == "update_node_text"
    assert patch.ops[0].text == "结构必须回到笔记"
    assert patch.id != sample_request().thought_model.id


@pytest.mark.asyncio
async def test_endpoint_maps_not_implemented_to_501(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.instruction_patches.compile_instruction_patch",
        AsyncMock(side_effect=NotImplementedError("parse_instruction_tool_calls")),
    )
    with pytest.raises(HTTPException) as error:
        await compile_instruction_patch_endpoint(sample_request(), current_user_dict)
    assert error.value.status_code == 501


@pytest.mark.asyncio
async def test_endpoint_maps_locked_value_error_to_400(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.instruction_patches.compile_instruction_patch",
        AsyncMock(side_effect=ValueError("node is locked: n-lock")),
    )
    with pytest.raises(HTTPException) as error:
        await compile_instruction_patch_endpoint(sample_request(), current_user_dict)
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_endpoint_maps_invalid_envelope_to_502(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.instruction_patches.compile_instruction_patch",
        AsyncMock(side_effect=InstructionPatchInvalidError("unknown tool name")),
    )
    with pytest.raises(HTTPException) as error:
        await compile_instruction_patch_endpoint(sample_request(), current_user_dict)
    assert error.value.status_code == 502


@pytest.mark.asyncio
async def test_endpoint_maps_not_configured_to_503(
    current_user_dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.app.api.v1.instruction_patches.compile_instruction_patch",
        AsyncMock(side_effect=InstructionPatchNotConfiguredError("LLM compilation is disabled")),
    )
    with pytest.raises(HTTPException) as error:
        await compile_instruction_patch_endpoint(sample_request(), current_user_dict)
    assert error.value.status_code == 503


def test_parse_instruction_tool_calls_orders_allowlisted_ops() -> None:
    ops = parse_instruction_tool_calls(
        {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call-2",
                                "type": "function",
                                "function": {
                                    "name": "delete_node",
                                    "arguments": '{"node_id":"n2"}',
                                },
                            },
                            {
                                "id": "call-1",
                                "type": "function",
                                "function": {
                                    "name": "update_node_text",
                                    "arguments": '{"node_id":"n1","text":"新文案"}',
                                },
                            },
                        ]
                    }
                }
            ]
        }
    )
    assert [op.op for op in ops] == ["delete_node", "update_node_text"]
    assert ops[1].text == "新文案"  # type: ignore[attr-defined]


def test_parse_instruction_tool_calls_rejects_add_node_and_bad_envelope() -> None:
    with pytest.raises(InstructionPatchInvalidError):
        parse_instruction_tool_calls(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "call-x",
                                    "type": "function",
                                    "function": {
                                        "name": "add_node",
                                        "arguments": '{"text":"覆盖全文"}',
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        )
    with pytest.raises(InstructionPatchInvalidError):
        parse_instruction_tool_calls({"choices": [{"message": {}}]})
    with pytest.raises(InstructionPatchInvalidError):
        parse_instruction_tool_calls(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "call-bad",
                                    "type": "function",
                                    "function": {
                                        "name": "update_node_text",
                                        "arguments": "{not-json",
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        )
