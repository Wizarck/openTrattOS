"""JSON extraction from LLM prose."""

from __future__ import annotations

import pytest

from rag_proxy.extractor import build_user_prompt, extract_json


def test_clean_json_dict() -> None:
    text = '{"value": 0.5, "citationUrl": "https://x", "snippet": "y"}'
    result = extract_json(text)
    assert result == {"value": 0.5, "citationUrl": "https://x", "snippet": "y"}


def test_markdown_json_fence() -> None:
    text = '```json\n{"value": 0.5, "citationUrl": "https://x", "snippet": "y"}\n```'
    result = extract_json(text)
    assert result == {"value": 0.5, "citationUrl": "https://x", "snippet": "y"}


def test_plain_markdown_fence() -> None:
    text = '```\n{"value": 0.5, "citationUrl": "https://x", "snippet": "y"}\n```'
    result = extract_json(text)
    assert result == {"value": 0.5, "citationUrl": "https://x", "snippet": "y"}


def test_prose_then_json() -> None:
    text = 'Sure, here is the answer:\n{"value": 0.5, "citationUrl": "https://x", "snippet": "y"}'
    result = extract_json(text)
    assert result == {"value": 0.5, "citationUrl": "https://x", "snippet": "y"}


def test_prose_only_returns_none() -> None:
    text = "I cannot answer this question with confidence."
    assert extract_json(text) is None


def test_malformed_json_returns_none() -> None:
    text = '{"value": 0.5, "citationUrl": "https://x", "snippet"}'  # missing value
    assert extract_json(text) is None


def test_null_value_in_dict_preserved() -> None:
    text = '{"value": null, "citationUrl": "", "snippet": ""}'
    result = extract_json(text)
    assert result == {"value": None, "citationUrl": "", "snippet": ""}


def test_empty_string_returns_none() -> None:
    assert extract_json("") is None
    assert extract_json("   ") is None


def test_non_string_returns_none() -> None:
    assert extract_json(None) is None  # type: ignore[arg-type]
    assert extract_json(123) is None  # type: ignore[arg-type]


def test_top_level_array_returns_none() -> None:
    text = '[1, 2, 3]'
    assert extract_json(text) is None


def test_build_user_prompt_yield() -> None:
    prompt = build_user_prompt("yield")
    assert "yield" in prompt.lower()
    assert "JSON" in prompt or "json" in prompt


def test_build_user_prompt_waste() -> None:
    prompt = build_user_prompt("waste")
    assert "waste" in prompt.lower()


def test_build_user_prompt_invalid_kind() -> None:
    with pytest.raises(ValueError, match="unknown kind"):
        build_user_prompt("unknown")
