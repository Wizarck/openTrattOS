"""Pure helpers for prompt construction and LLM-output JSON extraction."""

from __future__ import annotations

import json
import re
from typing import Any

YIELD_USER_PROMPT = (
    'Respond ONLY with valid JSON matching schema: '
    '{"value": <number 0-1>, "citationUrl": <string>, "snippet": <string>}. '
    "The `value` is the suggested yield factor (1.0 = no loss, 0.5 = 50% mass retained). "
    "The `citationUrl` MUST be the canonical URL of the source document "
    "(prefer https://fdc.nal.usda.gov, https://eur-lex.europa.eu, https://efsa.europa.eu). "
    "The `snippet` is a verbatim ≤500-char excerpt from the source. "
    "Do not wrap in markdown. Do not add prose. "
    'If you cannot cite a verifiable source, respond with: '
    '{"value": null, "citationUrl": "", "snippet": ""}.'
)

WASTE_USER_PROMPT = (
    'Respond ONLY with valid JSON matching schema: '
    '{"value": <number 0-1>, "citationUrl": <string>, "snippet": <string>}. '
    "The `value` is the recipe-level waste factor (0.0 = no waste, 0.2 = 20% waste). "
    "The `citationUrl` MUST be the canonical URL of the source document. "
    "The `snippet` is a verbatim ≤500-char excerpt from the source. "
    "Do not wrap in markdown. Do not add prose. "
    'If you cannot cite a verifiable source, respond with: '
    '{"value": null, "citationUrl": "", "snippet": ""}.'
)

VALUE_FROM_SNIPPET_PROMPT = (
    'Read this snippet and respond ONLY with: {{"value": <number 0-1>}}. '
    "The number represents a {kind} factor (1.0 = no loss, 0.5 = 50%). "
    'If you cannot derive a confident value, respond {{"value": null}}. '
    "No prose. No markdown. Snippet:\n\n{snippet}"
)

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?", re.IGNORECASE)
_FENCE_END_RE = re.compile(r"\n?```$")
_JSON_OBJECT_RE = re.compile(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", re.DOTALL)


def build_user_prompt(kind: str) -> str:
    if kind == "yield":
        return YIELD_USER_PROMPT
    if kind == "waste":
        return WASTE_USER_PROMPT
    raise ValueError(f"unknown kind: {kind}")


def extract_json(response_text: str) -> dict[str, Any] | None:
    """Best-effort JSON extraction from LLM prose.

    Tries: (1) direct parse, (2) strip markdown fence, (3) scan for embedded JSON object.
    Returns None if no parseable JSON found.
    """
    if not isinstance(response_text, str):
        return None
    text = response_text.strip()
    if not text:
        return None

    candidate = _strip_fences(text)
    parsed = _try_parse(candidate)
    if parsed is not None:
        return parsed

    for match in _JSON_OBJECT_RE.finditer(text):
        parsed = _try_parse(match.group(0))
        if parsed is not None:
            return parsed

    return None


def _strip_fences(text: str) -> str:
    text = _FENCE_RE.sub("", text, count=1)
    text = _FENCE_END_RE.sub("", text)
    return text.strip()


def _try_parse(text: str) -> dict[str, Any] | None:
    try:
        result = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if isinstance(result, dict):
        return result
    return None
