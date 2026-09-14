"""Versioned gold-set fixtures for compile/patch eval. No live LLM."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EvalSuite = Literal["citation_from_note", "no_quote_copy", "locked_immutable"]
GOLD_VERSION = "v1"


class GoldNoteBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class GoldQuote(BaseModel):
    model_config = ConfigDict(extra="forbid")

    block_id: str = Field(min_length=1)
    quote: str = Field(min_length=1)


class GoldNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    review_status: str = Field(min_length=1)


class GoldPatchOp(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: str = Field(min_length=1)
    node_id: str = Field(min_length=1)


class GoldCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    suite: EvalSuite
    expect_ok: bool
    note_blocks: list[GoldNoteBlock] = Field(default_factory=list)
    quotes: list[GoldQuote] = Field(default_factory=list)
    node_texts: list[str] = Field(default_factory=list)
    nodes: list[GoldNode] = Field(default_factory=list)
    patch_ops: list[GoldPatchOp] = Field(default_factory=list)


class GoldCaseResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    suite: EvalSuite
    ok: bool
    reason: str = ""


class GoldSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    notes: str = ""
    cases: list[GoldCase]


def gold_set_path(version: str = GOLD_VERSION) -> Path:
    return Path(__file__).resolve().parent / "gold_sets" / f"{version}.json"


def load_gold_cases(version: str = GOLD_VERSION) -> list[GoldCase]:
    payload = GoldSet.model_validate_json(gold_set_path(version).read_text(encoding="utf-8"))
    if payload.version != version:
        raise ValueError(f"gold set version mismatch: {payload.version!r} != {version!r}")
    if not payload.cases:
        raise ValueError("gold set is empty")
    return payload.cases
