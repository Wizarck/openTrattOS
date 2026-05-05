## 1. New package `packages/mcp-server-opentrattos/`

- [ ] 1.1 Create `packages/mcp-server-opentrattos/` with TypeScript scaffold + `package.json` (`@modelcontextprotocol/sdk` pinned, separate from `apps/api/`)
- [ ] 1.2 `tsconfig.json` with `noEmit: false` + `outDir: "dist"` (this package emits real JS for the Docker image / npm publish)
- [ ] 1.3 `src/index.ts` — MCP server entry: bootstrap + capability registration + start
- [ ] 1.4 Dockerfile + `.dockerignore` for the separable image
- [ ] 1.5 README.md documenting deploy (standalone Docker / npm install)
- [ ] 1.6 `.gitignore` covering `node_modules/`, `dist/`, `*.log`

## 2. Capability descriptors (read-only first, per Gate D decision 2)

- [ ] 2.1 `src/capabilities/recipes.ts` — `recipes.read(id)`, `recipes.list(filter?)`
- [ ] 2.2 `src/capabilities/menu-items.ts` — `menu-items.read(id)`, `menu-items.list(filter?)`
- [ ] 2.3 `src/capabilities/ingredients.ts` — `ingredients.read(id)`, `ingredients.search(barcode? | query?)`
- [ ] 2.4 Capability registry that exposes each as an MCP-callable
- [ ] 2.5 Unit tests covering each capability's wire format + happy-path response

## 3. HTTP client to apps/api/

- [ ] 3.1 `src/http-client.ts` — fetch-based wrapper with connection pooling (Node 20+ keep-alive defaults)
- [ ] 3.2 Forwards `X-Via-Agent` + `X-Agent-Name` headers (populated by the calling capability descriptor based on MCP client identity)
- [ ] 3.3 Surfaces non-2xx as typed errors with status + body
- [ ] 3.4 Unit tests with mocked fetch (no live REST traffic)

## 4. Audit middleware in apps/api/

- [ ] 4.1 `apps/api/src/shared/middleware/agent-audit.middleware.ts` — reads `X-Via-Agent` + `X-Agent-Name` headers; populates `req.agentContext`
- [ ] 4.2 Emits `AGENT_ACTION_EXECUTED` event with `{ executedBy, viaAgent: true, agentName, capabilityName, organizationId, timestamp }` payload
- [ ] 4.3 New event constant `AGENT_ACTION_EXECUTED` in `apps/api/src/cost/application/cost.events.ts` (channel reserved; future audit listener subscribes when audit_log lands)
- [ ] 4.4 Middleware no-op when headers absent (non-agent traffic unaffected)
- [ ] 4.5 Register middleware in `app.module.ts` (consumer-side; runs ahead of all controllers)
- [ ] 4.6 Unit tests: with/without headers; event emitter spy; middleware does not 5xx on missing headers

## 5. ESLint rule + CI

- [ ] 5.1 ESLint rule `no-import-agent-vendors-from-api` scoped to `apps/api/**`, blocking imports from `@modelcontextprotocol/sdk` and `@modelcontextprotocol/*`
- [ ] 5.2 Add to existing flat config in `apps/api/eslint.config.js`
- [ ] 5.3 Lint regression test: a fixture importing `@modelcontextprotocol/sdk` from `apps/api/src/__test_fixtures__/` triggers the rule
- [ ] 5.4 CI step `npm run lint --workspace=apps/api` includes the new rule (already covered by existing lint step; verify it picks up the rule)

## 6. Smoke test (MCP server end-to-end)

- [ ] 6.1 `packages/mcp-server-opentrattos/test/smoke.spec.ts` — spin up MCP server + mocked REST; list capabilities; execute one read; verify response shape
- [ ] 6.2 Pin Node 20+ for fetch + connection pooling
- [ ] 6.3 Smoke runs in CI as part of the `Test` job (no new pipeline)

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-mcp-server` — must pass
- [ ] 7.2 `npm run build --workspace=packages/mcp-server-opentrattos` — emits dist/ cleanly
- [ ] 7.3 `npm test --workspace=packages/mcp-server-opentrattos` — capability + HTTP-client + smoke tests green
- [ ] 7.4 `npm test --workspace=apps/api` — 459 backend tests still green; ≥3 new middleware tests pass
- [ ] 7.5 Lint clean across all workspaces; new rule fires on the fixture import
- [ ] 7.6 Docker image builds successfully (locally; CI is out of scope for this slice)
- [ ] 7.7 Confirm `apps/api/` has zero compile-time imports of any `@modelcontextprotocol/*`

## 8. CI + landing

- [ ] 8.1 PR opens proposal-only at Gate D for Master review
- [ ] 8.2 Implementation pushed AFTER Gate D approval
- [ ] 8.3 All 8 CI checks green; admin-merge once required checks pass
- [ ] 8.4 Archive `openspec/changes/m2-mcp-server/` → `openspec/specs/m2-mcp-server/`
- [ ] 8.5 Write `retros/m2-mcp-server.md`
- [ ] 8.6 Update auto-memory `project_m1_state.md`
- [ ] 8.7 File `m2-mcp-extras` slice for follow-up scope: write capabilities, AgentChatWidget, missingFields propagation, dual-mode CI matrix, agent registry with shared-secret signing
