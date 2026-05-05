## Context

Agent-Ready Foundation is openTrattOS's architectural pillar (PRD §FR41–45 + ADR-013). Every Recipe / MenuItem / Ingredient capability must be reachable via REST with parity to the UI; the MCP server `opentrattos` exposes those capabilities to any MCP-compatible client (Hermes, OpenCode, Claude Desktop, custom). Strict separation: zero compile-time dependency from `apps/api/` on agent vendors. This slice ships the M2 implementation of the pillar.

**Scope discipline post-#15**: this slice is heavy. Per the ai-playbook §6.7 binary-fork pattern, scope is scoped down to (a) MCP server scaffold + capability descriptors + lint rule (b) audit-headers passthrough middleware. `AgentChatWidget`, `missingFields` propagation across ALL existing endpoints, and dual-mode-CI matrix are deferred to a follow-up `m2-mcp-extras` slice if time-of-implementation suggests it. See Open Questions.

`audit_log` table doesn't exist yet (filed in M2 retros as tech debt). This slice uses the existing D12 + jsonb-override convention: agent-action attribution lives in the controller's emitted-event payload, NOT in a new table. Future audit-log slice will retro-attach.

## Goals / Non-Goals

**Goals:**
- New package `packages/mcp-server-opentrattos/` with `@modelcontextprotocol/sdk` (or equivalent — see Open Question 1) — separable Docker image / npm module per ADR-013.
- MCP server exposes a SUBSET of capabilities first: `recipes.read`, `recipes.list`, `menu-items.read`, `menu-items.list`, `ingredients.read`, `ingredients.search` (read-only smoke test). Write capabilities ship with `m2-mcp-extras` after first agent benchmark.
- HTTP client to `apps/api/` REST endpoints (NOT direct DB).
- Forwards `X-Via-Agent` + `X-Agent-Name` headers based on MCP client identity.
- ESLint rule `no-import-agent-vendors-from-api` blocking imports from `@modelcontextprotocol/*` in `apps/api/**`.
- Audit middleware `AgentAuditMiddleware` in `apps/api/` reads agent headers + emits `AGENT_ACTION_EXECUTED` event (channel reserved; future audit listener subscribes).
- Unit tests + smoke test (MCP server lists capabilities; one read flow end-to-end against a mocked REST API).

**Non-Goals (deferred to `m2-mcp-extras`):**
- `missingFields` + `nextRequired` propagation across ALL write endpoints (Recipe, MenuItem, Ingredient extended PUT/POST).
- `AgentChatWidget` UI component — no UI shipped in this slice.
- Dual-mode-CI matrix (`OPENTRATTOS_AGENT_ENABLED=true|false`) — ships with `m2-mcp-extras` once first agent benchmark validates the wire format.
- Write capabilities via MCP (`recipes.create`, `menu-items.update`, etc).
- WhatsApp routing (M2.x).
- MCP per-org sandboxing (M3+).
- Agent registry with shared-secret signing (deferred — M3 multi-tenant trigger).

## Decisions

- **MCP server in separate package** `packages/mcp-server-opentrattos/`. **Rationale**: ADR-013 mandates zero compile-time coupling to `apps/api/`.
- **MCP server consumes the same REST API as the UI**, not direct DB. **Rationale**: API parity is the contract; reading DB directly causes drift.
- **Audit middleware emits `AGENT_ACTION_EXECUTED` event** (channel reserved). **Rationale**: `audit_log` table doesn't exist yet. Event-bus first; persistent audit ships when the table does.
- **Lint rule `no-import-agent-vendors-from-api`**: ESLint rule + CI step. **Rationale**: structural enforcement at code-time prevents accidental drift.
- **Hindsight bank naming capability-based**: `opentrattos-recipes`, `opentrattos-suppliers`, `opentrattos-menus`, `opentrattos-ingredients`. **Rationale**: PRD architectural pillar; no orgId suffix in MVP.
- **Read-only first**: write capabilities defer to `m2-mcp-extras`. **Rationale**: write paths via MCP need careful audit-log treatment; ship the wire format + transport layer first, then iterate.

## Risks / Trade-offs

- [Risk] HTTP-API path adds latency. **Mitigation**: MCP server pools HTTP connections; first benchmark in `m2-mcp-extras`.
- [Risk] Agent identity spoofing via headers. **Mitigation**: shared-secret signing deferred to M3; this slice runs in trusted-internal-network mode only (documented in README).
- [Risk] `@modelcontextprotocol/sdk` not yet stable. **Mitigation**: Open Question 1 — pick the SDK version with the maintainer; pin exact version; document upgrade path.
- [Risk] Lift `audit_log` table later breaks event consumers. **Mitigation**: event payload carries everything a future listener needs (supplierItemId, ingredientId, recipeId, actor, timestamp, viaAgent, agentName, capabilityName).

## Migration Plan

Steps:
1. New package `packages/mcp-server-opentrattos/` with TypeScript scaffold + `@modelcontextprotocol/sdk` pinned version.
2. Capability descriptors for `recipes.{read,list}`, `menu-items.{read,list}`, `ingredients.{read,search}`.
3. HTTP client wrapping `apps/api/` REST endpoints; connection pooling.
4. Header forwarding: `X-Via-Agent` + `X-Agent-Name` populated from MCP client identity.
5. `AgentAuditMiddleware` in `apps/api/` reads agent headers, emits `AGENT_ACTION_EXECUTED` event with attribution payload.
6. ESLint rule `no-import-agent-vendors-from-api` scoped to `apps/api/**`.
7. Dockerfile + package.json publish config (separate from `apps/api/`).
8. Unit tests: MCP capability listing; HTTP client mock; middleware emits event on signed header.
9. Smoke test: spin up MCP server + mocked REST API; list capabilities; execute one read flow end-to-end.

Rollback: revert; the new package is isolated; the middleware is a no-op when `OPENTRATTOS_AGENT_ENABLED=false`.

## Open Questions

1. **MCP SDK choice.** Options:
   - (a) **`@modelcontextprotocol/sdk`** — official Anthropic-maintained TypeScript SDK
   - (b) `@anthropic-ai/sdk` — Claude SDK (not MCP-native; would require shimming)
   - (c) Hand-rolled MCP wire-protocol implementation against the spec

   Recommendation: **(a) official SDK**. Pin a specific version; document upgrade path.

2. **Slice scope: read-only first vs full read+write.** Options:
   - (a) **Read-only this slice** (`recipes.read/list`, `menu-items.read/list`, `ingredients.read/search`); writes ship in `m2-mcp-extras` follow-up
   - (b) Full read+write here (Recipe.create + MenuItem.update + Ingredient.applyOverride via MCP)

   Recommendation: **(a) read-only**. Validates the wire format + transport + audit middleware before write-path complexity.

3. **`AgentChatWidget` placement.** Options:
   - (a) **Defer to `m2-mcp-extras`** (this slice is backend-only)
   - (b) Ship the widget here; feature-flagged off by default

   Recommendation: **(a) defer**. Keeps this slice focused on the wire format; widget can come once the MCP server is stable.

Recommendation total: **1a / 2a / 3a**. Reply "yes to all" or pick differently.
