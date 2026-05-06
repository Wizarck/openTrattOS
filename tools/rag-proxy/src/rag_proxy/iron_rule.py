"""Iron-rule guard mirroring `apps/api/src/ai-suggestions/application/types.ts::applyIronRule`.

The rule:
  - citationUrl SHALL be a non-empty string after trim
  - snippet SHALL be a non-empty string after trim
  - value SHALL be a finite number within [0, 1]
  - snippet > 500 chars is truncated to 500 chars + ellipsis `…`

Failure on any condition collapses to None — apps/api treats None as
"no suggestion offered" and the chef sees manual entry only.
"""

from __future__ import annotations

import math
from typing import Any

from rag_proxy.schemas import QueryResponse

SNIPPET_MAX = 500
ELLIPSIS = "…"


def apply_iron_rule(value: Any, citation_url: Any, snippet: Any) -> QueryResponse | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    if math.isnan(float(value)) or math.isinf(float(value)):
        return None
    if not 0.0 <= float(value) <= 1.0:
        return None

    if not isinstance(citation_url, str):
        return None
    citation_url_clean = citation_url.strip()
    if not citation_url_clean:
        return None

    if not isinstance(snippet, str):
        return None
    snippet_clean = snippet.strip()
    if not snippet_clean:
        return None

    if len(snippet_clean) > SNIPPET_MAX:
        snippet_clean = snippet_clean[: SNIPPET_MAX - 1] + ELLIPSIS

    return QueryResponse(value=float(value), citationUrl=citation_url_clean, snippet=snippet_clean)
