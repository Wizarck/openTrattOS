# rag-proxy

Stateless FastAPI proxy that translates [LightRAG](https://github.com/HKUDS/LightRAG) responses into the canonical AI suggestion contract `{value, citationUrl, snippet}` used by `apps/api`'s `GptOssRagProvider`. Falls back to [Brave Search API](https://api.search.brave.com/) with a domain whitelist when LightRAG returns no high-confidence match.

Sits in front of an existing RAGAnything+LightRAG deployment on the VPS. Does not modify LightRAG.

## Architecture

```
apps/api ──[Bearer auth]──▶ rag-proxy ──┬──[X-API-Key]──▶ LightRAG
                                         └──[X-Subscription-Token]──▶ Brave Search
```

## Run locally

```bash
cd tools/rag-proxy
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
cp .env.example .env  # then edit
python -m rag_proxy
```

## Run tests

```bash
pytest
ruff check .
mypy src/
```

## Configuration

All via env vars. Required marked **required**.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LIGHTRAG_BASE_URL` | **yes** | — | LightRAG base URL, e.g. `http://lightrag:9621` |
| `LIGHTRAG_API_KEY` | no | — | LightRAG `X-API-Key` value (if auth enabled) |
| `LIGHTRAG_TIMEOUT_S` | no | `30` | HTTP timeout in seconds |
| `LIGHTRAG_MODE` | no | `hybrid` | LightRAG query mode (`hybrid`/`local`/`global`/`mix`/`naive`) |
| `LIGHTRAG_SCORE_THRESHOLD` | no | `0.6` | Below this → Brave fallback |
| `BRAVE_ENABLED` | no | `false` | Master switch for Brave fallback |
| `BRAVE_API_KEY` | conditional | — | Required when `BRAVE_ENABLED=true` |
| `BRAVE_TIMEOUT_S` | no | `10` | HTTP timeout for Brave API |
| `BRAVE_DAILY_BUDGET` | no | `1000` | Soft cap on Brave queries per UTC day |
| `BRAVE_DOMAIN_WHITELIST` | no | (curated list) | Comma-separated allowed result hostnames |
| `RAG_PROXY_API_KEY` | **yes** | — | Bearer token apps/api must present |

## Deploy to VPS

The included `Dockerfile` produces a slim image. Sample compose stanza in `docker-compose.example.yml`.

The actual deploy (TLS termination, secret rotation, observability) is operational and out of this slice's scope.
