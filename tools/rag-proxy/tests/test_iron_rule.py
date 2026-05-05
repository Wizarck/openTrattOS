"""Iron-rule guard parity with apps/api applyIronRule."""

from __future__ import annotations

import math

from rag_proxy.iron_rule import ELLIPSIS, SNIPPET_MAX, apply_iron_rule


def test_valid_response_passes() -> None:
    result = apply_iron_rule(0.65, "https://fdc.nal.usda.gov/x", "USDA snippet")
    assert result is not None
    assert result.value == 0.65
    assert result.citation_url == "https://fdc.nal.usda.gov/x"
    assert result.snippet == "USDA snippet"


def test_value_zero_and_one_inclusive() -> None:
    assert apply_iron_rule(0.0, "u", "s") is not None
    assert apply_iron_rule(1.0, "u", "s") is not None


def test_empty_citation_url_rejected() -> None:
    assert apply_iron_rule(0.5, "", "snippet") is None


def test_whitespace_citation_url_rejected() -> None:
    assert apply_iron_rule(0.5, "   ", "snippet") is None


def test_none_citation_url_rejected() -> None:
    assert apply_iron_rule(0.5, None, "snippet") is None


def test_empty_snippet_rejected() -> None:
    assert apply_iron_rule(0.5, "u", "") is None


def test_whitespace_snippet_rejected() -> None:
    assert apply_iron_rule(0.5, "u", "   ") is None


def test_value_out_of_range_negative() -> None:
    assert apply_iron_rule(-0.1, "u", "s") is None


def test_value_out_of_range_above() -> None:
    assert apply_iron_rule(1.1, "u", "s") is None


def test_nan_value_rejected() -> None:
    assert apply_iron_rule(math.nan, "u", "s") is None


def test_inf_value_rejected() -> None:
    assert apply_iron_rule(math.inf, "u", "s") is None


def test_non_numeric_value_rejected() -> None:
    assert apply_iron_rule("0.5", "u", "s") is None


def test_bool_value_rejected() -> None:
    # bool is a subclass of int in Python; iron rule must reject it explicitly.
    assert apply_iron_rule(True, "u", "s") is None


def test_snippet_truncated_above_max() -> None:
    long_snippet = "a" * (SNIPPET_MAX + 50)
    result = apply_iron_rule(0.5, "u", long_snippet)
    assert result is not None
    assert len(result.snippet) == SNIPPET_MAX
    assert result.snippet.endswith(ELLIPSIS)


def test_snippet_at_max_not_truncated() -> None:
    snippet = "a" * SNIPPET_MAX
    result = apply_iron_rule(0.5, "u", snippet)
    assert result is not None
    assert result.snippet == snippet
    assert not result.snippet.endswith(ELLIPSIS)


def test_citation_url_trimmed() -> None:
    result = apply_iron_rule(0.5, "  https://x  ", "s")
    assert result is not None
    assert result.citation_url == "https://x"


def test_snippet_trimmed() -> None:
    result = apply_iron_rule(0.5, "u", "  hello  ")
    assert result is not None
    assert result.snippet == "hello"
