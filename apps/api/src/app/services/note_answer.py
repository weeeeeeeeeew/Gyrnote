"""Answer a question from dual-layer RAG passages. Never writes the confirmed graph."""

from __future__ import annotations

import uuid as uuid_pkg
from collections.abc import Awaitable, Callable

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..schemas.graph_rag import GraphRagPassageHit, GraphRagRead
from ..schemas.note_answer import NoteAnswerRead, NoteAnswerRefuseReason, NoteAnswerTurn
from .candidate_compile import LLMResponseInvalidError, parse_llm_json_content
from .graph_rag import execute_graph_rag
from .llm_runtime import LlmNotConfiguredError, resolve_llm_runtime
from .note_chunks import EmbedTexts, embed_note_texts

ChatComplete = Callable[[list[dict[str, str]]], Awaitable[str]]

REFUSE_TEXT: dict[NoteAnswerRefuseReason, str] = {
    "no_confirmed_nodes": "当前范围没有已确认或锁定的节点，双层召回没有摘要可走，因此不能回答。请先审阅锁定相关结构。",
    "no_similar_nodes": "确认图里没有和这句相关的节点，没有锚定原文可引用，因此不能回答。请换问法。",
    "no_anchored_blocks": "找到了相关节点，但它们还没有锚定到正文，不能引用原文作答。请先给这些节点补锚点。",
    "no_passages": "相关节点锚定的原文里没有可用于回答的片段，因此不能编造答案。",
    "insufficient_evidence": "召回了原文，但其中不足以支撑一个有依据的回答。请换问法或补充笔记。",
}

NOTE_ANSWER_SYSTEM = """
You answer questions about the user's notes. The graph is only an index; facts come from passages.
Return ONLY JSON:
{"answer": string, "cited_block_ids": string[], "grounded": boolean}
Rules:
- Use only the provided passages. Do not invent facts, notes, or graph nodes.
- cited_block_ids must be a subset of the given block ids.
- If passages are insufficient, grounded=false, cited_block_ids=[], and answer must say so in Chinese.
- Do not output a ThoughtModel, ModelPatch, or instructions to edit the graph.
- Answer in Chinese. Keep it short.
""".strip()


class NoteAnswerError(Exception):
    pass


class NoteAnswerNotConfiguredError(NoteAnswerError, LlmNotConfiguredError):
    pass


class NoteAnswerInvalidError(NoteAnswerError):
    pass


class NoteAnswerProviderError(NoteAnswerError):
    pass


def refuse_reason_for(retrieval: GraphRagRead) -> NoteAnswerRefuseReason:
    if retrieval.empty_reason is not None:
        return retrieval.empty_reason
    return "no_passages"


def build_note_answer_messages(
    query: str,
    hits: list[GraphRagPassageHit],
    history: list[NoteAnswerTurn] | None = None,
) -> list[dict[str, str]]:
    lines = [
        f"- block_id={hit.block_id}; note={hit.note_title}; text={hit.text}"
        for hit in hits
    ]
    prior = [
        f"{turn.role}: {turn.content}"
        for turn in (history or [])[-8:]
    ]
    user = "\n".join(
        [
            *(["earlier turns:", *prior, ""] if prior else []),
            f"question: {query}",
            "passages (fact source for this turn):",
            *lines,
            "",
            "JSON now. Answer the latest question using these passages; earlier turns are only context.",
        ]
    )
    return [
        {"role": "system", "content": NOTE_ANSWER_SYSTEM},
        {"role": "user", "content": user},
    ]


def parse_grounded_answer(raw: object, allowed_block_ids: set[str]) -> tuple[str, list[str], bool]:
    if not isinstance(raw, dict):
        raise NoteAnswerInvalidError("LLM response must be a JSON object")
    answer = raw.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise NoteAnswerInvalidError("LLM answer is empty")
    cited_raw = raw.get("cited_block_ids")
    cited: list[str] = []
    seen: set[str] = set()
    if isinstance(cited_raw, list):
        for item in cited_raw:
            if not isinstance(item, str) or item not in allowed_block_ids or item in seen:
                continue
            seen.add(item)
            cited.append(item)
    grounded_flag = raw.get("grounded")
    grounded = bool(cited) and grounded_flag is not False
    return answer.strip(), cited, grounded


async def complete_note_answer_chat(
    messages: list[dict[str, str]],
    llm_override: dict[str, object] | None = None,
) -> str:
    try:
        api_key, base_url, model = resolve_llm_runtime(llm_override)
    except LlmNotConfiguredError as exc:
        raise NoteAnswerNotConfiguredError(str(exc)) from exc

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=body)
    except httpx.TimeoutException as exc:
        raise NoteAnswerProviderError(
            f"LLM request timed out after {settings.LLM_TIMEOUT_SECONDS}s"
        ) from exc
    except httpx.HTTPError as exc:
        raise NoteAnswerProviderError(f"LLM request failed ({type(exc).__name__})") from exc
    if response.status_code >= 400:
        raise NoteAnswerProviderError(f"LLM provider returned HTTP {response.status_code}")
    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise NoteAnswerInvalidError("LLM response envelope is invalid") from exc
    if not isinstance(content, str) or not content.strip():
        raise NoteAnswerInvalidError("LLM response content is empty")
    return content


def _refused(retrieval: GraphRagRead, reason: NoteAnswerRefuseReason) -> NoteAnswerRead:
    return NoteAnswerRead(
        answer=REFUSE_TEXT[reason],
        grounded=False,
        refuse_reason=reason,
        cited_block_ids=[],
        nodes=retrieval.nodes,
        hits=retrieval.hits,
    )


async def execute_note_answer(
    db: AsyncSession,
    owner_id: int,
    query: str,
    query_embedding: list[float],
    k: int,
    *,
    node_k: int = 5,
    note_ids: list[uuid_pkg.UUID] | None = None,
    embed_texts: EmbedTexts | None = None,
    chat_complete: ChatComplete | None = None,
    llm_override: dict[str, object] | None = None,
    history: list[NoteAnswerTurn] | None = None,
) -> NoteAnswerRead:
    retrieval = await execute_graph_rag(
        db,
        owner_id,
        query_embedding,
        k,
        node_k=node_k,
        note_ids=note_ids,
        query_text=query,
        embed_texts=embed_texts or embed_note_texts,
    )
    if not retrieval.hits:
        return _refused(retrieval, refuse_reason_for(retrieval))

    chat = chat_complete or (lambda messages: complete_note_answer_chat(messages, llm_override))
    raw_content = await chat(build_note_answer_messages(query, retrieval.hits, history))
    try:
        raw_object = parse_llm_json_content(raw_content)
    except LLMResponseInvalidError as exc:
        raise NoteAnswerInvalidError("LLM response is not valid JSON") from exc
    allowed = {hit.block_id for hit in retrieval.hits}
    answer, cited, grounded = parse_grounded_answer(raw_object, allowed)
    if not grounded:
        return NoteAnswerRead(
            answer=answer if answer else REFUSE_TEXT["insufficient_evidence"],
            grounded=False,
            refuse_reason="insufficient_evidence",
            cited_block_ids=cited,
            nodes=retrieval.nodes,
            hits=retrieval.hits,
        )
    return NoteAnswerRead(
        answer=answer,
        grounded=True,
        refuse_reason=None,
        cited_block_ids=cited,
        nodes=retrieval.nodes,
        hits=retrieval.hits,
    )
