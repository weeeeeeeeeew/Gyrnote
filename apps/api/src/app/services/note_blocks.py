"""Extract stable Tiptap blocks. Mirrors the frontend extractNoteBlocks rules."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NoteBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


def extract_note_blocks(doc: Any) -> list[NoteBlock]:
    """Collect paragraph/heading nodes that have a non-blank blockId and text.

    Recurse into content. Do not raise. Empty or malformed input returns [].
    """
    blocks: list[NoteBlock] = []
    _walk(doc, blocks)
    return blocks


def _walk(node: Any, blocks: list[NoteBlock]) -> None:
    if not isinstance(node, dict):
        return
    node_type = node.get("type")
    if node_type in {"paragraph", "heading"}:
        attrs = node.get("attrs")
        block_id = attrs.get("blockId") if isinstance(attrs, dict) else None
        if isinstance(block_id, str) and block_id:
            parts: list[str] = []
            for child in node.get("content") or []:
                if (
                    isinstance(child, dict)
                    and child.get("type") == "text"
                    and isinstance(child.get("text"), str)
                ):
                    parts.append(child["text"])
            text = "".join(parts).strip()
            if text:
                blocks.append(NoteBlock(id=block_id, text=text))
    for child in node.get("content") or []:
        _walk(child, blocks)
