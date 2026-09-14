"""Rule-layer citation span validity.

This is not RAGAS Faithfulness (claim vs context NLI) and not ALCE
citation precision (NLI entailment of node text by the quote).
It measures: of quotes that are not an exact contiguous substring of the
declared block, or that cite an unknown block/anchor id, what fraction
the compile validator rejects. Exact-match rejection recall is 1.0 by
construction; this file makes that rate explicit for resume/eval use.
"""

from __future__ import annotations

from src.app.schemas.candidate import (
    CandidateThoughtEdge,
    CandidateThoughtModel,
    CandidateThoughtNode,
    CompileNoteBlock,
    CompileSourceAnchor,
)
from src.app.services.candidate_compile import (
    LLMResponseInvalidError,
    ensure_candidate_anchors_are_known,
    locate_quote_in_block,
    materialize_proposed_anchors,
)

BLOCK = CompileNoteBlock(id="block-1", text="秋招方向需要可回原文的结构图")
KNOWN_ANCHOR = CompileSourceAnchor(id="anchor-1", quote="可回原文", block_id="block-1")


def _rejected(action) -> bool:
    try:
        action()
    except LLMResponseInvalidError:
        return True
    return False


def test_ungrounded_quote_rejection_recall_is_one() -> None:
    cases = [
        lambda: locate_quote_in_block(BLOCK.text, "模型编造的句子"),
        lambda: locate_quote_in_block(BLOCK.text, "   "),
        lambda: materialize_proposed_anchors(
            [{"id": "p1", "block_id": "block-1", "quote": "不在原文里"}],
            [BLOCK],
        ),
        lambda: materialize_proposed_anchors(
            [{"id": "p1", "block_id": "missing-block", "quote": "可回原文"}],
            [BLOCK],
        ),
        lambda: ensure_candidate_anchors_are_known(
            CandidateThoughtModel(
                id="c1",
                note_id="note-1",
                source_revision=1,
                title="候选",
                nodes=[
                    CandidateThoughtNode(
                        id="n1",
                        type="claim",
                        text="编造主张",
                        source_anchor_ids=["unknown-anchor"],
                        confidence=0.5,
                    )
                ],
                edges=[],
            ),
            [KNOWN_ANCHOR],
        ),
        lambda: ensure_candidate_anchors_are_known(
            CandidateThoughtModel(
                id="c1",
                note_id="note-1",
                source_revision=1,
                title="候选",
                nodes=[
                    CandidateThoughtNode(
                        id="n1",
                        type="claim",
                        text="编造主张",
                        source_anchor_ids=["anchor-1"],
                        confidence=0.5,
                    )
                ],
                edges=[
                    CandidateThoughtEdge(
                        id="e1",
                        source_node_id="n1",
                        target_node_id="n1",
                        type="supports",
                        source_anchor_ids=["unknown-edge-anchor"],
                        confidence=0.5,
                    )
                ],
            ),
            [KNOWN_ANCHOR],
        ),
    ]

    rejected = sum(1 for case in cases if _rejected(case))
    rejection_recall = rejected / len(cases)
    assert rejection_recall == 1.0


def test_exact_substring_quote_is_accepted() -> None:
    assert locate_quote_in_block(BLOCK.text, "可回原文") == (6, 10)
    materialized, _remap = materialize_proposed_anchors(
        [{"id": "p1", "block_id": "block-1", "quote": "可回原文"}],
        [BLOCK],
    )
    assert len(materialized) == 1
    assert materialized[0].quote == "可回原文"
