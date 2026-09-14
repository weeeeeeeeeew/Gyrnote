"""Cross-note structure queries. Graph is a filter; answers come from notes."""

from __future__ import annotations

import uuid as uuid_pkg
from collections import defaultdict

from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.note import Note, NoteVersion, SourceAnchor
from ..schemas.note import PersistedThoughtModel, PersistedThoughtNode
from ..schemas.structure_query import StructureQueryHit, StructureQueryKind, StructureQueryRead


class StructureNoteSnapshot(BaseModel):
    """One owner's current NoteVersion: confirmed model + quotes. Not a candidate."""

    model_config = ConfigDict(extra="forbid")

    note_id: uuid_pkg.UUID
    title: str
    thought_model: PersistedThoughtModel
    quotes_by_anchor_id: dict[str, str]

def build_hit(
    snapshot: StructureNoteSnapshot,
    node: PersistedThoughtNode,
    kind: StructureQueryKind,
) -> StructureQueryHit:
    quotes = [
        snapshot.quotes_by_anchor_id[anchor_id]
        for anchor_id in node.source_anchor_ids
        if anchor_id in snapshot.quotes_by_anchor_id
    ]

    # 根据 kind 生成 reason
    reason_map = {
        "unsupported_claims": "claim has no confirmed/locked evidence supporting it",
        "shared_assumption": "assumption appears in at least two notes",
        "open_questions": "open question has no confirmed/locked answer",
    }
    reason = reason_map.get(kind, "")

    return StructureQueryHit(
        note_id=str(snapshot.note_id),
        note_title=snapshot.title,
        node_id=node.id,
        node_type=node.type,
        node_text=node.text,
        reason=reason,
        quotes=quotes,
    )

def match_structure_query(
    kind: StructureQueryKind,
    notes: list[StructureNoteSnapshot],
) -> list[StructureQueryHit]:
    """Return hits for one of the three P0 templates. Do not call an LLM.

    Inputs: kind + current-version snapshots already scoped to one owner.
    Output: hits whose node_text/quotes come from those snapshots (note is fact source).
    Treat review_status confirmed and locked as confirmed structure; skip suggested.

    unsupported_claims:
      Confirmed/locked claim with no confirmed/locked edge
      evidence --supports--> that claim.
    shared_assumption:
      Confirmed/locked assumption whose stripped text appears in at least two notes.
      (Semantic near-duplicates are M6.2 pgvector; exact text only here.)
    open_questions:
      Confirmed/locked open_question with no confirmed/locked answers edge
      that has this node as source or target.
    Unknown kind must fail closed (ValueError).
    Fill quotes from snapshot.quotes_by_anchor_id using node.source_anchor_ids.
    """
    if kind == "unsupported_claims":
        hits = []
        for snapshot in notes:
            model = snapshot.thought_model
            # 1.过滤出 confirmed/locked claim 节点
            claims = [n for n in model.nodes if n.review_status in ["confirmed", "locked"] and n.type == "claim"]
            # 2.过滤出 confirmed/locked 的 supports 边
            supports = [e for e in model.edges if e.review_status in ["confirmed", "locked"] and e.type == "supports"]
            # 3.检查每个claim节点有没有支持边
            for claim in claims:
                if not any(e.target_node_id == claim.id for e in supports):
                    hits.append(build_hit(snapshot, claim, "unsupported_claims"))
        return hits
    elif kind == "shared_assumption":
        hits = []
        text_to_note_ids = defaultdict(set)   # text → set[note_id]
        text_to_nodes = defaultdict(list)     # text → list[(snapshot, node)]
        for snapshot in notes:
            for node in snapshot.thought_model.nodes:
                if node.type == "assumption" and node.review_status in ("confirmed", "locked"):
                    key = node.text.strip()
                    text_to_note_ids[key].add(str(snapshot.note_id))
                    text_to_nodes[key].append((snapshot, node))
        # 找出跨 ≥2 笔记的 assumption
        for text, note_ids in text_to_note_ids.items():
            if len(note_ids) >= 2:
                for snapshot, node in text_to_nodes[text]:
                    hits.append(build_hit(snapshot, node, "shared_assumption"))
        return hits
    elif kind == "open_questions":
        hits = []
        for snapshot in notes:
            model = snapshot.thought_model
            # 1. 过滤 confirmed/locked 的 open_question 节点
            questions = [n for n in model.nodes
            if n.review_status in ["confirmed", "locked"] and n.type == "open_question"]
            # 2. 过滤 confirmed/locked 的 answers 边
            answers = [e for e in model.edges if e.review_status in ["confirmed", "locked"] and e.type == "answers"]
            # 3. 对每个 question，检查有没有 answers 边 source 或 target 是它
            #    （规则说"该节点做 source 或 target 都不算未闭环"——意思是只要存在就不命中）
            for question in questions:
                if not any(e.source_node_id == question.id or e.target_node_id == question.id for e in answers):
                    hits.append(build_hit(snapshot, question, "open_questions"))
        return hits
    else:
        raise ValueError(f"Unknown kind: {kind}")

async def execute_structure_query(
    db: AsyncSession,
    owner_id: int,
    kind: StructureQueryKind,
) -> StructureQueryRead:
    notes = await load_owner_current_snapshots(db, owner_id)
    hits = match_structure_query(kind, notes)
    return StructureQueryRead(kind=kind, hits=hits)


async def load_owner_current_snapshots(
    db: AsyncSession,
    owner_id: int,
) -> list[StructureNoteSnapshot]:
    rows = await db.execute(
        select(Note, NoteVersion)
        .join(NoteVersion, Note.current_version_id == NoteVersion.id)
        .where(Note.owner_id == owner_id)
        .order_by(Note.updated_at.desc(), Note.id)
    )
    pairs = list(rows.all())
    if not pairs:
        return []

    version_ids = [version.id for _note, version in pairs]
    anchor_rows = await db.execute(select(SourceAnchor).where(SourceAnchor.note_version_id.in_(version_ids)))
    quotes_by_version: dict[uuid_pkg.UUID, dict[str, str]] = {}
    for anchor in anchor_rows.scalars().all():
        quotes_by_version.setdefault(anchor.note_version_id, {})[str(anchor.anchor_id)] = anchor.quote

    snapshots: list[StructureNoteSnapshot] = []
    for note, version in pairs:
        try:
            thought_model = PersistedThoughtModel.model_validate(version.thought_model_json)
        except ValidationError:
            continue
        snapshots.append(
            StructureNoteSnapshot(
                note_id=note.id,
                title=note.title,
                thought_model=thought_model,
                quotes_by_anchor_id=quotes_by_version.get(version.id, {}),
            )
        )
    return snapshots
