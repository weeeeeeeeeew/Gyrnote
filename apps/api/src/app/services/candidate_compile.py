from __future__ import annotations

import json
import uuid as uuid_pkg
from typing import Any

import httpx
from pydantic import ValidationError

from ..core.config import settings
from ..schemas.candidate import (
    CandidateCompileRequest,
    CandidateThoughtModel,
    CompileNoteBlock,
    CompileSourceAnchor,
    ProposedSourceAnchor,
)

CANDIDATE_JSON_SCHEMA_HINT = """
Return ONLY JSON (no markdown):
{
  "id": string, "note_id": string, "source_revision": number, "title": string,
  "proposed_anchors": [{"id": string, "block_id": string, "quote": string}],
  "nodes": [{"id": string, "type": nodeType, "label": string|null, "text": string,
             "source_anchor_ids": string[], "confidence": number}],
  "edges": [{"id": string, "source_node_id": string, "target_node_id": string,
             "type": edgeType, "label": string|null, "source_anchor_ids": string[],
             "confidence": number}]
}
nodeType: question|concept|observation|claim|evidence|assumption|counterpoint|decision|open_question|action|custom
edgeType: supports|challenges|depends_on|qualifies|explains|leads_to|answers|tests|custom
Prefer core enums; use custom only when none fit, and then label is required (short name).
For non-custom types set label to null.
proposed_anchors.block_id MUST be one of the provided note block ids.
proposed_anchors.quote MUST be an exact contiguous substring of that block's text (prefer one sentence / one clause; stay inside one block).
proposed_anchors.id MUST be a short local code such as "a1"/"a2" (do NOT invent UUIDs; server will remap).
Each node.source_anchor_ids MUST be non-empty; each id is a user anchor id OR a proposed_anchors.id.
A node MAY cite multiple anchors across different blocks (discontinuous evidence OK).
Do not invent block ids or anchor ids outside those sets.
""".strip()

# 首次编译（initial compile）：噪声原文证据 → 候选结构。不是增量调图。
INITIAL_COMPILE_RULES = """
mode=initial_compile

Evidence: prefer proposing anchors from note blocks when user anchors are sparse/absent.
  quote must copy exact contiguous text from one provided block; never invent wording.
  use multiple proposed_anchors when one idea needs cross-block or discontinuous evidence.
  proposed_anchors.id = short codes a1,a2,... (not UUIDs).
Nodes: one idea each; text=short paraphrase (not quote copy); strip filler;
  prefer ~8-40 Chinese chars; split condition vs outcome into separate nodes when both matter.
  node ids may be short codes n1,n2,...
Edges: only clear logic; endpoints must be your node ids.
Anchoring: node.source_anchor_ids (non-empty) cite user and/or proposed anchors; multi-id OK.
Empty: no note blocks and no user anchors => empty proposed_anchors/nodes/edges.
title: model summary, not a pasted quote.
confidence: 0..1 (higher only if explicit in evidence).
""".strip()


class CandidateCompileError(Exception):
    """Raised when candidate compilation fails before writing any confirmed model."""


class LLMNotConfiguredError(CandidateCompileError):
    pass


class LLMResponseInvalidError(CandidateCompileError):
    pass


def build_compile_messages(request: CandidateCompileRequest) -> list[dict[str, str]]:
    """Build chat messages for initial compile (not incremental revise)."""
    block_lines = [
        f"- id={block.id}; text={json.dumps(block.text, ensure_ascii=False)}"
        for block in request.note_blocks
    ]
    anchor_lines = [
        f"- id={anchor.id}; block={anchor.block_id}; quote={json.dumps(anchor.quote, ensure_ascii=False)}"
        for anchor in request.source_anchors
    ]
    user_content = "\n".join(
        [
            "mode: initial_compile",
            f"note_id: {request.note_id}",
            f"source_revision: {request.source_revision}",
            f"title: {request.title}",
            "note_blocks (source text with stable block ids):",
            *(block_lines or ["(none)"]),
            "user_anchors (optional; may be empty):",
            *(anchor_lines or ["(none)"]),
            "",
            INITIAL_COMPILE_RULES,
            "",
            "Output candidate ThoughtModel JSON now.",
        ]
    )
    return [
        {
            "role": "system",
            "content": (
                "Gyrnote INITIAL compile: extract evidence quotes from note blocks, "
                "then build abstracted candidate structure. JSON only.\n"
                f"{CANDIDATE_JSON_SCHEMA_HINT}"
            ),
        },
        {"role": "user", "content": user_content},
    ]


def parse_llm_json_content(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseInvalidError("LLM response is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise LLMResponseInvalidError("LLM response must be a JSON object")
    return payload


def enforce_request_identity(
    candidate: CandidateThoughtModel,
    request: CandidateCompileRequest,
) -> CandidateThoughtModel:
    return candidate.model_copy(
        update={
            "note_id": request.note_id,
            "source_revision": request.source_revision,
            "id": candidate.id or f"candidate-{request.note_id}-{request.source_revision}",
        }
    )


def locate_quote_in_block(block_text: str, quote: str) -> tuple[int, int]:
    """Locate an exact quote span inside one note block. Returns [start, end)."""
    if not quote.strip():
        raise LLMResponseInvalidError("blank quote")
    index = block_text.find(quote)
    if index < 0:
        raise LLMResponseInvalidError("quote not found in block")
    return index, index + len(quote)


def is_uuid_string(value: str) -> bool:
    try:
        uuid_pkg.UUID(value)
    except ValueError:
        return False
    return True


def materialize_proposed_anchors(
    raw_proposed: Any,
    note_blocks: list[CompileNoteBlock],
) -> tuple[list[ProposedSourceAnchor], dict[str, str]]:
    """Locate quotes and normalize proposed ids to UUIDs for Note persistence."""
    if raw_proposed is None:
        return [], {}
    if not isinstance(raw_proposed, list):
        raise LLMResponseInvalidError("proposed_anchors must be a list")

    blocks_by_id = {block.id: block.text for block in note_blocks}
    materialized: list[ProposedSourceAnchor] = []
    seen_ids: set[str] = set()
    id_remap: dict[str, str] = {}

    for item in raw_proposed:
        if not isinstance(item, dict):
            raise LLMResponseInvalidError("proposed_anchor must be an object")
        anchor_id = item.get("id")
        block_id = item.get("block_id")
        quote = item.get("quote")
        if not isinstance(anchor_id, str) or not isinstance(block_id, str) or not isinstance(quote, str):
            raise LLMResponseInvalidError("proposed_anchor fields must be strings")
        if anchor_id in seen_ids:
            raise LLMResponseInvalidError("duplicate proposed_anchor id")
        if block_id not in blocks_by_id:
            raise LLMResponseInvalidError("unknown proposed_anchor block_id")

        local_id = anchor_id if is_uuid_string(anchor_id) else str(uuid_pkg.uuid4())
        if local_id != anchor_id:
            id_remap[anchor_id] = local_id

        start, end = locate_quote_in_block(blocks_by_id[block_id], quote)
        try:
            materialized.append(
                ProposedSourceAnchor(
                    id=local_id,
                    block_id=block_id,
                    quote=quote,
                    start_offset=start,
                    end_offset=end,
                )
            )
        except ValidationError as exc:
            raise LLMResponseInvalidError("proposed_anchor failed validation") from exc
        seen_ids.add(anchor_id)

    return materialized, id_remap


def apply_proposed_anchor_id_remap(raw_object: dict[str, Any], id_remap: dict[str, str]) -> None:
    if not id_remap:
        return

    nodes = raw_object.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            ids = node.get("source_anchor_ids")
            if isinstance(ids, list):
                node["source_anchor_ids"] = [
                    id_remap.get(item, item) if isinstance(item, str) else item for item in ids
                ]

    edges = raw_object.get("edges")
    if isinstance(edges, list):
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            ids = edge.get("source_anchor_ids")
            if isinstance(ids, list):
                edge["source_anchor_ids"] = [
                    id_remap.get(item, item) if isinstance(item, str) else item for item in ids
                ]


def ensure_candidate_anchors_are_known(
    _candidate: CandidateThoughtModel,
    _allowed_anchors: list[CompileSourceAnchor],
) -> CandidateThoughtModel:
    """Ensure every node/edge anchor id is in the allowed set (user ∪ proposed)."""
    allowed_anchors_ids = {allowed_anchor.id for allowed_anchor in _allowed_anchors}
    for node in _candidate.nodes:
        for anchor_id in node.source_anchor_ids:
            if anchor_id not in allowed_anchors_ids:
                raise LLMResponseInvalidError("unknown source_anchor_id")
    for edge in _candidate.edges:
        for anchor_id in edge.source_anchor_ids:
            if anchor_id not in allowed_anchors_ids:
                raise LLMResponseInvalidError("unknown source_anchor_id")
    return _candidate


def _empty_candidate(request: CandidateCompileRequest) -> CandidateThoughtModel:
    return CandidateThoughtModel(
        id=f"candidate-{request.note_id}-{request.source_revision}",
        note_id=request.note_id,
        source_revision=request.source_revision,
        title="待审阅候选模型",
        proposed_anchors=[],
        nodes=[],
        edges=[],
    )


async def call_openai_compatible_chat(messages: list[dict[str, str]]) -> str:
    if not settings.LLM_ENABLED:
        raise LLMNotConfiguredError("LLM compilation is disabled")
    api_key = settings.LLM_API_KEY.get_secret_value() if settings.LLM_API_KEY is not None else ""
    if not api_key.strip():
        raise LLMNotConfiguredError("LLM_API_KEY is not configured")

    base_url = settings.LLM_BASE_URL.rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise CandidateCompileError(
            f"LLM request timed out after {settings.LLM_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.HTTPError as exc:
        # Surface exception class only — never include headers/body (may hold secrets).
        raise CandidateCompileError(f"LLM request failed ({type(exc).__name__})") from exc

    if response.status_code >= 400:
        raise CandidateCompileError(f"LLM provider returned HTTP {response.status_code}")

    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise LLMResponseInvalidError("LLM response envelope is invalid") from exc

    if not isinstance(content, str) or not content.strip():
        raise LLMResponseInvalidError("LLM response content is empty")
    return content


async def compile_candidate_model(request: CandidateCompileRequest) -> CandidateThoughtModel:
    has_blocks = any(block.text.strip() for block in request.note_blocks)
    if not has_blocks and not request.source_anchors:
        return _empty_candidate(request)

    messages = build_compile_messages(request)
    raw_content = await call_openai_compatible_chat(messages)
    raw_object = parse_llm_json_content(raw_content)

    proposed_anchors, id_remap = materialize_proposed_anchors(
        raw_object.get("proposed_anchors"),
        request.note_blocks,
    )
    apply_proposed_anchor_id_remap(raw_object, id_remap)
    raw_object = {
        **raw_object,
        "proposed_anchors": [anchor.model_dump() for anchor in proposed_anchors],
    }

    try:
        candidate = CandidateThoughtModel.model_validate(raw_object)
    except Exception as exc:
        raise LLMResponseInvalidError("LLM JSON failed CandidateThoughtModel validation") from exc

    candidate = enforce_request_identity(candidate, request)
    allowed = [
        *request.source_anchors,
        *[
            CompileSourceAnchor(id=anchor.id, quote=anchor.quote, block_id=anchor.block_id)
            for anchor in candidate.proposed_anchors
        ],
    ]
    return ensure_candidate_anchors_are_known(candidate, allowed)
