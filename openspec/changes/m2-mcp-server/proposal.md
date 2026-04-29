## Why

The Agent-Ready Foundation is the architectural pillar of openTrattOS — every Recipe / MenuItem / Ingredient capability must be reachable via API with parity to the UI, no UI-only actions (FR41). The MCP server `opentrattos` is what lets external agent clients (Hermes, OpenCode, Claude Desktop, custom) drive the system without scraping the UI. ADR-013 mandates strict separation: zero compile-time dependency from `apps/api/` on agent vendors. This slice is the M2 implementation of that pillar.

## What Changes

- Public-API parity audit (FR41): every Recipe / MenuItem / Ingredient capability is reachable via REST; no UI-only actions exist. Audit + close any gaps surfaced.
- API responses include `missingFields` and `nextRequired` so a conversational caller can determine what's needed to complete a partial state (FR42).
- Standalone-mode vs agent-integrated-mode toggle via configuration only — no code change required to switch (FR43, ADR-013).
- MCP server `opentrattos` exposing the M2 capabilities to any MCP-compatible client (FR44). Implementation per ADR-013 separability: the MCP layer is a separate Docker image / npm module, zero compile-time coupling to `apps/api/`.
- Audit fields on agent actions (FR45): `executedBy=<human user>, viaAgent=true, agentName=<…>` per the hybrid identity model. Recorded in `audit_log` for every API call routed via MCP.
- Optional `AgentChatWidget` UI component behind feature flag `OPENTRATTOS_AGENT_ENABLED` (per `docs/ux/components.md`).
- Lint rule blocking `import` from agent vendor packages in `apps/api/` (CI-enforced per ADR-013).
- Standalone-deployment dual-mode CI test: every PR runs both `OPENTRATTOS_AGENT_ENABLED=false` and `=true` smoke tests.
- **BREAKING** (none — additive; standalone mode remains the default.)

## Capabilities

### New Capabilities

- `m2-mcp-server`: MCP server `opentrattos` exposing Recipe/MenuItem/Ingredient capabilities + agent-action audit fields + dual-mode (standalone/agent-integrated).

### Modified Capabilities

(none — additive on top of #2/#5/#8 endpoints; existing M1 specs are not amended.)

## Impact

- **Prerequisites**: `#2 m2-recipes-core` (the capabilities to expose). #5 and #8 ideally land first too, but the MCP layer can ship as Recipes-only and extend per slice.
- **Code**: new package `packages/mcp-server-opentrattos/` (Docker image + npm module per ADR-013 separability), `apps/api/src/audit/` extension for `viaAgent` + `agentName` fields, `packages/ui-kit/src/agent-chat-widget/`.
- **External dependencies**: `@modelcontextprotocol/sdk` or equivalent MCP server library. Feature-flagged via `OPENTRATTOS_AGENT_ENABLED`.
- **CI**: dual-mode pipeline (standalone vs agent-integrated). Lint rule `no-import-agent-vendors-from-api`.
- **Switching modes**: ≤30 min, configuration-only, per FR43.
- **Hindsight bank naming**: capability-based (`opentrattos-recipes`, `opentrattos-suppliers`, `opentrattos-menus`) per the architectural pillar.
- **Out of scope**: WhatsApp routing (M2.x), MCP per-org sandboxing (M3+).
