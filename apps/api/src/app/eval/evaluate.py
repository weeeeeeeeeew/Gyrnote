"""Score gold-set cases with deterministic rules. Does not call a model."""

from __future__ import annotations

from ..services.candidate_compile import LLMResponseInvalidError, locate_quote_in_block
from .gold import GoldCase, GoldCaseResult


def evaluate_gold_case(case: GoldCase) -> GoldCaseResult:
    """Return whether this fixture's artifact is valid under its suite rule.

    Inputs: one GoldCase from load_gold_cases().
    Output: GoldCaseResult.ok True iff the artifact passes the suite rule
    (not iff it matches expect_ok — the test compares those).
    Suites:
    - citation_from_note: every quote is an exact contiguous substring of the
      named note block. Unknown block_id is not ok.
    - no_quote_copy: after strip, no node text equals any quote.
    - locked_immutable: no patch op may target a node whose review_status is locked.
    Unknown suite must fail closed.
    Reuse locate_quote_in_block for citation. Do not call the LLM.
    """
    if case.suite == "citation_from_note":
        block_map = {b.id: b for b in case.note_blocks}   # ★ 先建 dict
        for quote in case.quotes:
            if quote.block_id not in block_map:
                return GoldCaseResult(ok=False, reason=f"unknown block_id: {quote.block_id}",
                case_id=case.id, suite=case.suite)
            try:
                locate_quote_in_block(block_map[quote.block_id].text, quote.quote)  # ★ 复用
            except LLMResponseInvalidError as e:
                return GoldCaseResult(ok=False, reason=str(e), case_id=case.id, suite=case.suite)
        return GoldCaseResult(ok=True, case_id=case.id, suite=case.suite)

    elif case.suite == "no_quote_copy":
        for node_text in case.node_texts:
            for quote in case.quotes:
                if node_text.strip() == quote.quote.strip():  # ★ 加 strip
                    return GoldCaseResult(ok=False, case_id=case.id, suite=case.suite)
        return GoldCaseResult(ok=True, case_id=case.id, suite=case.suite)

    elif case.suite == "locked_immutable":
        node_map = {n.id: n for n in case.nodes}   # ★ 先建 dict
        for patch_op in case.patch_ops:
            node = node_map.get(patch_op.node_id)
            if node is None:
                return GoldCaseResult(ok=False, reason=f"unknown node_id: {patch_op.node_id}",
                case_id=case.id, suite=case.suite)
            if node.review_status == "locked":
                return GoldCaseResult(ok=False, case_id=case.id, suite=case.suite)
        return GoldCaseResult(ok=True, case_id=case.id, suite=case.suite)

    else:
        raise ValueError(f"Unknown suite: {case.suite}")
