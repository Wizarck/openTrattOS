## 1. API parity audit + missingFields contract

- [ ] 1.1 Inventory every UI write action; verify each has a documented REST endpoint
- [ ] 1.2 Add `missingFields` + `nextRequired` to every write-endpoint response shape (Recipe, MenuItem, Ingredient)
- [ ] 1.3 Implement `MissingFieldsResolver` utility that introspects the entity vs schema's required fields
- [ ] 1.4 OpenAPI / Swagger surface published documenting every endpoint + RBAC + missingFields contract

## 2. Agent middleware in apps/api

- [ ] 2.1 Implement `AgentAuditMiddleware` that reads `X-Via-Agent` + `X-Agent-Name` headers
- [ ] 2.2 Signature verification against agent registry (initial registry: a single shared-secret entry; M3 may extend)
- [ ] 2.3 Audit-log writer extends to include `viaAgent` + `agentName` fields
- [ ] 2.4 Unsigned/unknown agent header → 401 Unauthorized, no audit row written
- [ ] 2.5 Middleware is no-op when `OPENTRATTOS_AGENT_ENABLED=false`

## 3. MCP server package

- [ ] 3.1 Create `packages/mcp-server-opentrattos/` with TypeScript + `@modelcontextprotocol/sdk`
- [ ] 3.2 Implement capability descriptors for `recipes.*`, `menu-items.*`, `ingredients.*` with read + write operations
- [ ] 3.3 MCP server proxies to the REST API (HTTP client + connection pooling); does NOT touch DB directly
- [ ] 3.4 Forwards `X-Via-Agent` + `X-Agent-Name` headers based on the MCP client identity
- [ ] 3.5 Passes through `missingFields` / `nextRequired` in responses to the MCP client
- [ ] 3.6 Dockerfile + npm publish config (separate from `apps/api/` per ADR-013 separability)

## 4. UI: AgentChatWidget (optional)

- [ ] 4.1 `packages/ui-kit/src/agent-chat-widget/` — feature-flagged via `OPENTRATTOS_AGENT_ENABLED`
- [ ] 4.2 Connects to MCP server `opentrattos`; renders chat surface with capability invocation
- [ ] 4.3 Hidden when flag is false; visible when true
- [ ] 4.4 Storybook story with mocked MCP responses
- [ ] 4.5 Tests cover hidden / visible / capability-invocation flows

## 5. Lint rule + CI

- [ ] 5.1 ESLint rule `no-import-agent-vendors-from-api`: scoped to `apps/api/**`, blocks imports from `@modelcontextprotocol/*` and known agent SDKs
- [ ] 5.2 Add the rule to the existing ESLint config
- [ ] 5.3 CI step runs `pnpm lint` before tests; failure blocks merge
- [ ] 5.4 Dual-mode CI: matrix job with `OPENTRATTOS_AGENT_ENABLED=true|false` running smoke tests per mode

## 6. Tests

- [ ] 6.1 Unit: MissingFieldsResolver returns correct fields for partial Recipe / MenuItem / Ingredient
- [ ] 6.2 Unit: AgentAuditMiddleware rejects unsigned headers; populates fields on signed
- [ ] 6.3 E2E: standalone-mode smoke (UI works without agent surface)
- [ ] 6.4 E2E: agent-integrated-mode smoke (MCP server reachable, capabilities listable, recipe.create succeeds via MCP)
- [ ] 6.5 E2E: switching `OPENTRATTOS_AGENT_ENABLED=false → true` activates the surface within 30 minutes
- [ ] 6.6 Lint regression test: a fixture importing `@modelcontextprotocol/sdk` from `apps/api` triggers the lint rule

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-mcp-server` — must pass
- [ ] 7.2 First MCP-client benchmark: end-to-end agent-mediated Recipe creation latency < 1s p95
- [ ] 7.3 Pre-launch: agent registry entry for the openTrattOS internal agent + Hermes integration smoke
