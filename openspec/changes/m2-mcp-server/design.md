## Context

Agent-Ready Foundation is openTrattOS's architectural pillar (PRD §FR41–45 + ADR-013). Every Recipe / MenuItem / Ingredient capability must be reachable via REST with parity to the UI; the MCP server `opentrattos` exposes those capabilities to any MCP-compatible client (Hermes, OpenCode, Claude Desktop, custom). Strict separation: zero compile-time dependency from `apps/api/` on agent vendors. This slice ships the M2 implementation of the pillar.

## Goals / Non-Goals

**Goals:**
- API-parity audit (FR41): every Recipe/MenuItem/Ingredient capability reachable via REST.
- `missingFields` + `nextRequired` in API responses (FR42) so conversational callers can complete partial state.
- Standalone vs agent-integrated mode toggle via configuration (FR43, ADR-013).
- MCP server `opentrattos` (Docker image / npm module per ADR-013 separability) (FR44).
- Audit fields on agent actions: `executedBy`, `viaAgent`, `agentName` (FR45).
- Optional `AgentChatWidget` UI behind `OPENTRATTOS_AGENT_ENABLED` flag.
- Lint rule blocking `import` from agent vendors in `apps/api/`.
- Dual-mode CI: every PR runs both standalone + agent-integrated smoke tests.

**Non-Goals:**
- WhatsApp routing (M2.x).
- MCP per-org sandboxing (M3+).
- Authentication beyond the existing user identity model (the human user remains responsible per ADR-013 hybrid identity).

## Decisions

- **MCP server in separate package** `packages/mcp-server-opentrattos/`. **Rationale**: ADR-013 mandates zero compile-time coupling to `apps/api/`. Separate package + separate Docker image lets the MCP layer be deployed independently, scaled independently, deprecated independently.
- **MCP server consumes the same REST API as the UI**, not direct DB. **Rationale**: API parity is the contract; if MCP read DB directly, parity drift becomes inevitable. Slower (HTTP overhead) but architecturally honest.
- **`missingFields` + `nextRequired` on every write endpoint response.** **Rationale**: conversational callers (and the UI) both benefit from a uniform "what's missing?" contract. UI uses it for progressive disclosure; agents use it for next-action planning.
- **Audit fields `viaAgent` + `agentName` populated by middleware** when request carries `X-Via-Agent` + `X-Agent-Name` headers. **Rationale**: middleware is opt-in; non-agent traffic is unaffected. Agent clients sign the header; signature verified against the trusted agent registry.
- **Lint rule `no-import-agent-vendors-from-api`**: ESLint rule + CI step. **Rationale**: structural enforcement at code-time prevents accidental drift.
- **Hindsight bank naming capability-based**: `opentrattos-recipes`, `opentrattos-suppliers`, `opentrattos-menus`, `opentrattos-ingredients`. **Rationale**: PRD architectural pillar; no orgId suffix in MVP; future M3 may federate.

## Risks / Trade-offs

- [Risk] HTTP-API path adds latency. **Mitigation**: MCP server can pool connections + cache idempotent reads; first agent benchmark in M2 for SLA confidence.
- [Risk] Agent identity spoofing via headers. **Mitigation**: agent registry with shared-secret signing; signature verification middleware rejects unsigned/unknown agent IDs.
- [Risk] Dual-mode CI doubles test runtime. **Mitigation**: smoke-only path in agent-integrated mode (full suite in standalone); first signs of an agent-mode-specific bug, expand.

## Migration Plan

Steps:
1. New package `packages/mcp-server-opentrattos/` with TypeScript + `@modelcontextprotocol/sdk` (or equivalent).
2. MCP server exposes Recipes, MenuItems, Ingredients capabilities mapped to REST endpoints.
3. Audit middleware in `apps/api/` honours `X-Via-Agent` + `X-Agent-Name` headers; populates `audit_log.via_agent` + `audit_log.agent_name`.
4. Feature flag `OPENTRATTOS_AGENT_ENABLED`: when `false`, MCP server is not deployed; UI hides AgentChatWidget; API ignores agent headers.
5. Lint rule + CI gate.
6. Standalone smoke test + agent-integrated smoke test both green per PR.

Rollback: set `OPENTRATTOS_AGENT_ENABLED=false`; MCP server can be removed; UI degrades cleanly. M3+ can re-enable.

## Open Questions

- Per-org agent allowlist: deferred to M3 once first multi-tenant customer ships.
