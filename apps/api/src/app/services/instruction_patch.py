"""Compile a natural-language graph edit into a candidate ModelPatch. Never writes confirmed structure."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from ..core.config import settings
from ..schemas.instruction_patch import (
    InstructionOp,
    InstructionPatchRead,
    InstructionPatchRequest,
)

ALLOWED_TOOL_NAMES = frozenset({"update_node_text", "delete_node", "move_anchor"})
FORBIDDEN_TOOL_NAMES = frozenset({"add_node", "add_edge"})

INSTRUCTION_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "update_node_text",
            "description": "Change the text of an existing confirmed node. Do not invent node ids.",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "node_id": {"type": "string"},
                    "text": {"type": "string"},
                },
                "required": ["node_id", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_node",
            "description": "Delete an existing node that no longer has evidence. Cascades edges.",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"node_id": {"type": "string"}},
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_anchor",
            "description": "Move an existing source anchor to a new block-local range.",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "anchor_id": {"type": "string"},
                    "start_offset": {"type": "integer"},
                    "end_offset": {"type": "integer"},
                },
                "required": ["anchor_id", "start_offset", "end_offset"],
            },
        },
    },
]

INSTRUCTION_SYSTEM_PROMPT = """
You edit a confirmed ThoughtModel by calling tools. Output tool calls only.
Allowed tools: update_node_text, delete_node, move_anchor.
Never call add_node or add_edge. Never invent node ids or anchor ids.
Do not modify locked nodes. Do not cover uncovered note paragraphs by adding nodes.
The result is a candidate patch; a human must approve before it writes the confirmed model.
""".strip()

_OP_ADAPTER: TypeAdapter[InstructionOp] = TypeAdapter(InstructionOp)

ParseInstructionTools = Callable[[object], list[InstructionOp]]
ChatWithTools = Callable[[list[dict[str, str]], list[dict[str, Any]]], Awaitable[object]]


class InstructionPatchError(Exception):
    pass


class InstructionPatchNotConfiguredError(InstructionPatchError):
    pass


class InstructionPatchInvalidError(InstructionPatchError):
    pass


def parse_instruction_tool_calls(payload: object) -> list[InstructionOp]:
    """Parse an OpenAI-compatible tool_calls envelope into allowlisted ModelPatch ops.

    Inputs: chat completions JSON with choices[0].message.tool_calls[].function.{name, arguments}.
    arguments is a JSON object string. Preserve tool_calls order.
    Allowlist: update_node_text, delete_node, move_anchor.
    Fail closed with InstructionPatchInvalidError when the envelope is missing, tool_calls is empty,
    name is unknown/add_node/add_edge, arguments are not JSON objects, extra fields appear,
    or required fields are blank.
    """
    if not isinstance(payload, dict):
        raise InstructionPatchInvalidError("LLM response envelope is invalid")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise InstructionPatchInvalidError("LLM response envelope is invalid")
    first = choices[0]
    if not isinstance(first, dict):
        raise InstructionPatchInvalidError("LLM response envelope is invalid")
    message = first.get("message")
    if not isinstance(message, dict):
        raise InstructionPatchInvalidError("LLM response envelope is invalid")
    tool_calls = message.get("tool_calls")
    if not isinstance(tool_calls, list) or not tool_calls:
        raise InstructionPatchInvalidError("tool_calls is missing")

    ops: list[InstructionOp] = []
    for call in tool_calls:
        ops.append(_parse_one_tool_call(call))
    return ops


def _parse_one_tool_call(call: object) -> InstructionOp:
    if not isinstance(call, dict):
        raise InstructionPatchInvalidError("tool call is invalid")
    function = call.get("function")
    if not isinstance(function, dict):
        raise InstructionPatchInvalidError("tool call function is invalid")
    name = function.get("name")
    if not isinstance(name, str) or not name.strip():
        raise InstructionPatchInvalidError("unknown tool name")
    arguments = _parse_tool_arguments(function.get("arguments"))
    return coerce_instruction_op({**arguments, "op": name})


def _parse_tool_arguments(arguments: object) -> dict[str, Any]:
    if not isinstance(arguments, str):
        raise InstructionPatchInvalidError("tool call arguments must be a JSON object string")
    try:
        parsed = json.loads(arguments)
    except json.JSONDecodeError as exc:
        raise InstructionPatchInvalidError("tool call arguments are not JSON") from exc
    if not isinstance(parsed, dict):
        raise InstructionPatchInvalidError("tool call arguments must be an object")
    return parsed


def build_instruction_patch(
    request: InstructionPatchRequest,
    ops: Sequence[InstructionOp],
) -> InstructionPatchRead:
    if not ops:
        raise ValueError("patch must contain at least one op")
    nodes = {node.id: node for node in request.thought_model.nodes}
    locked = {node.id for node in request.thought_model.nodes if node.review_status == "locked"}
    anchors = {anchor.id for anchor in request.source_anchors}
    validated: list[InstructionOp] = []
    for op in ops:
        if op.op == "update_node_text":
            node = nodes.get(op.node_id)
            if node is None:
                raise ValueError(f"unknown node: {op.node_id}")
            if op.node_id in locked:
                raise ValueError(f"node is locked: {op.node_id}")
            validated.append(op)
        elif op.op == "delete_node":
            if op.node_id not in nodes:
                raise ValueError(f"unknown node: {op.node_id}")
            if op.node_id in locked:
                raise ValueError(f"node is locked: {op.node_id}")
            validated.append(op)
        elif op.op == "move_anchor":
            if op.anchor_id not in anchors:
                raise ValueError(f"unknown anchor: {op.anchor_id}")
            validated.append(op)
        else:
            raise ValueError("unsupported op")
    patch_id = f"patch-nl-{request.note_id}-v{request.thought_model.version}"
    if patch_id == request.thought_model.id:
        patch_id = f"{patch_id}-candidate"
    return InstructionPatchRead(
        id=patch_id,
        note_id=request.note_id,
        base_model_version=request.thought_model.version,
        reason=request.instruction[:200],
        ops=list(validated),
    )


def coerce_instruction_op(raw: object) -> InstructionOp:
    if not isinstance(raw, dict):
        raise InstructionPatchInvalidError("tool call arguments must be an object")
    name = raw.get("op")
    if name in FORBIDDEN_TOOL_NAMES:
        raise InstructionPatchInvalidError("add_node/add_edge is not allowed")
    if name not in ALLOWED_TOOL_NAMES:
        raise InstructionPatchInvalidError("unknown tool name")
    try:
        return _OP_ADAPTER.validate_python(raw)
    except ValidationError as exc:
        raise InstructionPatchInvalidError("tool call arguments are invalid") from exc


async def call_openai_compatible_tools(
    messages: list[dict[str, str]],
    tools: list[dict[str, Any]],
) -> object:
    if not settings.LLM_ENABLED:
        raise InstructionPatchNotConfiguredError("LLM compilation is disabled")
    api_key = settings.LLM_API_KEY.get_secret_value() if settings.LLM_API_KEY is not None else ""
    if not api_key.strip():
        raise InstructionPatchNotConfiguredError("LLM_API_KEY is not configured")

    base_url = settings.LLM_BASE_URL.rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise InstructionPatchError(
            f"LLM request timed out after {settings.LLM_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.HTTPError as exc:
        raise InstructionPatchError(f"LLM request failed ({type(exc).__name__})") from exc

    if response.status_code >= 400:
        raise InstructionPatchError(f"LLM provider returned HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise InstructionPatchInvalidError("LLM response is not JSON") from exc


def build_instruction_messages(request: InstructionPatchRequest) -> list[dict[str, str]]:
    node_lines = [
        f"- id={node.id}; status={node.review_status}; text={node.text}"
        for node in request.thought_model.nodes
    ]
    anchor_lines = [
        f"- id={anchor.id}; block={anchor.block_id}; offsets={anchor.start_offset}:{anchor.end_offset}"
        for anchor in request.source_anchors
    ]
    user = (
        f"note_id={request.note_id}\n"
        f"model_id={request.thought_model.id}\n"
        f"model_version={request.thought_model.version}\n"
        f"nodes:\n{chr(10).join(node_lines) or '- none'}\n"
        f"anchors:\n{chr(10).join(anchor_lines) or '- none'}\n"
        f"instruction:\n{request.instruction}"
    )
    return [
        {"role": "system", "content": INSTRUCTION_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


async def compile_instruction_patch(
    request: InstructionPatchRequest,
    *,
    parse_tools: ParseInstructionTools | None = None,
    chat_with_tools: ChatWithTools | None = None,
) -> InstructionPatchRead:
    parse = parse_tools or parse_instruction_tool_calls
    chat = chat_with_tools or call_openai_compatible_tools
    payload = await chat(build_instruction_messages(request), INSTRUCTION_TOOLS)
    ops = parse(payload)
    return build_instruction_patch(request, ops)
