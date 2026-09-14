"""Deterministic gold-set eval. No live LLM. Not LLM-as-a-Judge."""

from __future__ import annotations

import pytest

from src.app.eval import GOLD_VERSION, GoldCase, evaluate_gold_case, load_gold_cases

pytestmark = pytest.mark.eval

SUITES = {"citation_from_note", "no_quote_copy", "locked_immutable"}
_GOLD_CASES = load_gold_cases()


def test_gold_v1_covers_three_suites_with_pass_and_fail() -> None:
    assert GOLD_VERSION == "v1"
    suites = {case.suite for case in _GOLD_CASES}
    assert suites == SUITES
    for suite in SUITES:
        subset = [case for case in _GOLD_CASES if case.suite == suite]
        assert any(case.expect_ok for case in subset), suite
        assert any(not case.expect_ok for case in subset), suite


@pytest.mark.parametrize("case", _GOLD_CASES, ids=lambda case: case.id)
def test_evaluate_gold_case_matches_label(case: GoldCase) -> None:
    result = evaluate_gold_case(case)
    assert result.case_id == case.id
    assert result.suite == case.suite
    assert result.ok is case.expect_ok, result.reason


def test_unknown_suite_fails_closed() -> None:
    case = GoldCase.model_construct(
        id="unknown-suite",
        suite="not_a_suite",
        expect_ok=True,
    )
    try:
        result = evaluate_gold_case(case)
    except NotImplementedError:
        pytest.fail("evaluate_gold_case is not implemented")
    except ValueError:
        return
    assert result.ok is False
    assert result.reason
