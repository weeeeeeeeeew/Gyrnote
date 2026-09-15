"""Dual-layer retrieval: rank confirmed nodes, then RAG only their anchored blocks.

Layer 1 selects retrieval-relevant summaries (node.text), not structurally unsupported nodes.
Layer 2 ranks note-body chunks whose block_id was collected from those nodes' source anchors.
This is not GraphRAG: the graph never generates answers. Empty graph does not fall back to all chunks.
"""

from __future__ import annotations

import math
import uuid as uuid_pkg
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.note import Note, NoteVersion, SourceAnchor
from ..schemas.graph_rag import GraphRagEmptyReason, GraphRagNodeHit, GraphRagPassageHit, GraphRagRead
from ..schemas.note import PersistedThoughtEdge, PersistedThoughtModel, PersistedThoughtNode, ThoughtReviewStatus
from .chunk_recall import (
    load_owner_current_note_docs,
    match_lexical_note_blocks,
    merge_recall_hits,
    recall_note_chunks,
)
from .note_chunks import EmbedTexts, embed_note_texts

CONFIRMED_STATUSES: frozenset[ThoughtReviewStatus] = frozenset({"confirmed", "locked"})
NODE_MIN_SCORE = 0.25
NODE_RELATIVE_SCORE = 0.6


class AnchorRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_id: str
    quote: str


class GraphRagSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note_id: uuid_pkg.UUID
    title: str
    thought_model: PersistedThoughtModel
    anchors_by_id: dict[str, AnchorRef]


@dataclass(frozen=True)
class RankedNode:
    snapshot: GraphRagSnapshot
    node: PersistedThoughtNode
    score: float


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        raise ValueError("embedding dimensions do not match")
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right, strict=True):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return dot / math.sqrt(left_norm * right_norm)


def list_confirmed_nodes(model: PersistedThoughtModel) -> list[PersistedThoughtNode]:
    return [node for node in model.nodes if node.review_status in CONFIRMED_STATUSES]


def rank_nodes_for_query(
    candidates: list[tuple[GraphRagSnapshot, PersistedThoughtNode]],
    query_embedding: list[float],
    node_embeddings: list[list[float]],
    *,
    k: int,
    min_score: float = NODE_MIN_SCORE,
    relative_score: float = NODE_RELATIVE_SCORE,
) -> list[RankedNode]:
    """Rank confirmed nodes by cosine(query, node.text embedding). Not a defect scan."""
    if k < 1:
        raise ValueError("k must be >= 1")
    if len(candidates) != len(node_embeddings):
        raise ValueError("embedding count does not match nodes")
    ranked: list[RankedNode] = []
    for (snapshot, node), embedding in zip(candidates, node_embeddings, strict=True):
        score = cosine_similarity(query_embedding, embedding)
        ranked.append(RankedNode(snapshot=snapshot, node=node, score=score))
    ranked.sort(key=lambda item: (-item.score, item.node.id))
    if not ranked:
        return []
    cutoff = max(min_score, ranked[0].score * relative_score)
    return [item for item in ranked if item.score >= cutoff][:k]


def merge_ranked_with_lexical(
    ranked: list[RankedNode],
    candidates: list[tuple[GraphRagSnapshot, PersistedThoughtNode]],
    query_text: str | None,
    k: int,
) -> list[RankedNode]:
    """Keep cosine hits and any node whose summary contains the query string."""
    by_id = {item.node.id: item for item in ranked}
    needle = query_text.strip().casefold() if query_text else ""
    if needle:
        for snapshot, node in candidates:
            if needle not in node.text.casefold():
                continue
            current = by_id.get(node.id)
            score = 1.0 if current is None else max(current.score, 1.0)
            by_id[node.id] = RankedNode(snapshot=snapshot, node=node, score=score)
    merged = sorted(by_id.values(), key=lambda item: (-item.score, item.node.id))
    return merged[:k]


def expand_one_hop(selected_ids: set[str], edges: list[PersistedThoughtEdge]) -> set[str]:
    """Add confirmed/locked neighbors so evidence quotes can ride with a similar claim."""
    expanded = set(selected_ids)
    for edge in edges:
        if edge.review_status not in CONFIRMED_STATUSES:
            continue
        if edge.source_node_id in selected_ids:
            expanded.add(edge.target_node_id)
        if edge.target_node_id in selected_ids:
            expanded.add(edge.source_node_id)
    return expanded


def collect_block_ids(
    nodes: list[PersistedThoughtNode],
    anchors_by_id: dict[str, AnchorRef],
) -> list[str]:
    block_ids: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        for anchor_id in node.source_anchor_ids:
            ref = anchors_by_id.get(anchor_id)
            if ref is None or ref.block_id in seen:
                continue
            seen.add(ref.block_id)
            block_ids.append(ref.block_id)
    return block_ids


def empty_graph_rag(reason: GraphRagEmptyReason, nodes: list[GraphRagNodeHit] | None = None) -> GraphRagRead:
    return GraphRagRead(nodes=nodes or [], hits=[], scoped_block_count=0, empty_reason=reason)


async def execute_graph_rag(
    db: AsyncSession,
    owner_id: int,
    query_embedding: list[float],
    k: int,
    *,
    node_k: int = 5,
    note_ids: list[uuid_pkg.UUID] | None = None,
    query_text: str | None = None,
    embed_texts: EmbedTexts | None = None,
) -> GraphRagRead:
    snapshots = await load_graph_rag_snapshots(db, owner_id, note_ids)
    candidates: list[tuple[GraphRagSnapshot, PersistedThoughtNode]] = []
    for snapshot in snapshots:
        for node in list_confirmed_nodes(snapshot.thought_model):
            candidates.append((snapshot, node))
    if not candidates:
        return empty_graph_rag("no_confirmed_nodes")

    embed = embed_texts or embed_note_texts
    node_embeddings = await embed([node.text for _snapshot, node in candidates])
    ranked = merge_ranked_with_lexical(
        rank_nodes_for_query(candidates, query_embedding, node_embeddings, k=node_k),
        candidates,
        query_text,
        node_k,
    )
    if not ranked:
        return empty_graph_rag("no_similar_nodes")

    selected_ids = {item.node.id for item in ranked}
    expanded_ids = set(selected_ids)
    for snapshot in snapshots:
        local_selected = {node.id for node in snapshot.thought_model.nodes if node.id in selected_ids}
        if local_selected:
            expanded_ids |= expand_one_hop(local_selected, snapshot.thought_model.edges)

    block_ids: list[str] = []
    scoped_note_ids: list[uuid_pkg.UUID] = []
    seen_blocks: set[tuple[str, str]] = set()
    seen_notes: set[uuid_pkg.UUID] = set()
    node_for_block: dict[tuple[str, str], str] = {}
    ranked_ids = selected_ids
    for snapshot in snapshots:
        local = [
            node
            for node in snapshot.thought_model.nodes
            if node.id in expanded_ids and node.review_status in CONFIRMED_STATUSES
        ]
        local.sort(key=lambda node: (0 if node.id in ranked_ids else 1, node.id))
        for node in local:
            for block_id in collect_block_ids([node], snapshot.anchors_by_id):
                key = (str(snapshot.note_id), block_id)
                if key not in seen_blocks:
                    seen_blocks.add(key)
                    block_ids.append(block_id)
                node_for_block.setdefault(key, node.id)
                if snapshot.note_id not in seen_notes:
                    seen_notes.add(snapshot.note_id)
                    scoped_note_ids.append(snapshot.note_id)

    node_hits = [
        GraphRagNodeHit(
            note_id=str(item.snapshot.note_id),
            note_title=item.snapshot.title,
            node_id=item.node.id,
            node_type=item.node.type,
            node_text=item.node.text,
            score=item.score,
        )
        for item in ranked
    ]
    if not block_ids:
        return empty_graph_rag("no_anchored_blocks", node_hits)

    recall_note_filter = note_ids if note_ids else scoped_note_ids
    passages = await recall_note_chunks(
        db,
        owner_id,
        query_embedding,
        k,
        note_ids=recall_note_filter,
        block_ids=block_ids,
    )
    if query_text and query_text.strip():
        docs = await load_owner_current_note_docs(db, owner_id, recall_note_filter)
        lexical = match_lexical_note_blocks(query_text, docs, k, block_ids=block_ids)
        passages = merge_recall_hits(passages, lexical, k)

    hits = [
        GraphRagPassageHit(
            note_id=hit.note_id,
            note_title=hit.note_title,
            node_id=node_for_block.get((hit.note_id, hit.block_id), ranked[0].node.id),
            block_id=hit.block_id,
            text=hit.text,
            score=hit.score,
        )
        for hit in passages
    ]
    return GraphRagRead(nodes=node_hits, hits=hits, scoped_block_count=len(seen_blocks), empty_reason=None)


async def load_graph_rag_snapshots(
    db: AsyncSession,
    owner_id: int,
    note_ids: list[uuid_pkg.UUID] | None = None,
) -> list[GraphRagSnapshot]:
    stmt = (
        select(Note, NoteVersion)
        .join(NoteVersion, Note.current_version_id == NoteVersion.id)
        .where(Note.owner_id == owner_id)
        .order_by(Note.updated_at.desc(), Note.id)
    )
    if note_ids:
        stmt = stmt.where(Note.id.in_(note_ids))
    pairs = list((await db.execute(stmt)).all())
    if not pairs:
        return []
    version_ids = [version.id for _note, version in pairs]
    anchor_rows = await db.execute(select(SourceAnchor).where(SourceAnchor.note_version_id.in_(version_ids)))
    anchors_by_version: dict[uuid_pkg.UUID, dict[str, AnchorRef]] = {}
    for anchor in anchor_rows.scalars().all():
        anchors_by_version.setdefault(anchor.note_version_id, {})[str(anchor.anchor_id)] = AnchorRef(
            block_id=anchor.block_id,
            quote=anchor.quote,
        )
    snapshots: list[GraphRagSnapshot] = []
    for note, version in pairs:
        try:
            thought_model = PersistedThoughtModel.model_validate(version.thought_model_json)
        except ValidationError:
            continue
        snapshots.append(
            GraphRagSnapshot(
                note_id=note.id,
                title=note.title,
                thought_model=thought_model,
                anchors_by_id=anchors_by_version.get(version.id, {}),
            )
        )
    return snapshots
