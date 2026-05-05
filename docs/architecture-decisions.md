# Architecture Decision Records (ADR)

**Project:** openTrattOS  
**Status:** Approved by Product Owner  
**Date:** 2026-04-19

---

## ADR-001: Modular Monolith with DDD over Microservices

**Decision:** The backend is a single NestJS process organized as a Modular Monolith 
following Domain-Driven Design (DDD) Bounded Contexts.

**Rationale:** True microservices impose unsustainable operational complexity for an 
early-stage Open Source project. DDD Bounded Contexts provide clear module boundaries 
that can be extracted into independent services later without architectural rewrites.

**Consequence:** Every module (ingredients, costing, haccp, operations) is fully 
self-contained. Cross-module communication happens via published interfaces, never 
direct entity imports.

---

## ADR-002: API-First Design for MCP Agent Compatibility

**Decision:** All API endpoints must be atomic, semantically named, and fully 
documented in OpenAPI/Swagger from day one.

**Rationale:** In TrattOS Enterprise, the API will be wrapped as MCP (Model Context 
Protocol) Tools to be consumed by AI agents (Hermes/OpenClaw). An agent LLM must be 
able to understand what a tool does from its name and description alone, without 
reading documentation.

**Rules enforced:**
- No generic route names (no /process, /handle, /do)
- Every endpoint has a Swagger @ApiOperation summary and description
- Request and Response DTOs are always explicitly typed (never `any`)
- Pagination is consistent across all list endpoints (cursor-based)

---

## ADR-003: AI Layer is Optional and Isolated

**Decision:** The Python FastAPI AI microservice is a separate process. The NestJS 
API only calls it if `AI_SERVICE_URL` is set in environment variables.

**Rationale:** openTrattOS Community Edition must work 100% offline and without AI 
costs. The AI layer is a TrattOS Enterprise differentiator.

---

## ADR-004: Multi-Tenant Architecture from Day One

**Decision:** All primary database tables include `organizationId` as a required 
non-nullable foreign key.

**Rationale:** A single restaurateur uses 1 organization. A group with 5 venues uses 
1 organization with 5 Locations. This enables TrattOS Enterprise's multi-venue 
management without schema migrations later.

---

## ADR-005: TrattOS Enterprise Agent Stack (Reserved)

**Decision:** The following components are out of scope for openTrattOS Community and 
are reserved for TrattOS Enterprise:

- **Agent Runtime:** Hermes / OpenClaw
- **Memory Layer:** Hindsight
- **Messaging Interface:** WhatsApp / Telegram bridge for kitchen staff
- **Orchestration:** LangGraph workflows
- **Infrastructure:** Deployed and managed via Rancher (Kubernetes)

**Rationale:** These components require permanent cloud infrastructure, secrets 
management, and SLA guarantees incompatible with a self-hosted Open Source project.

---

## ADR-006: Role-Based Access Control (RBAC)

**Decision:** The system implements a three-tier role model: `OWNER`, `MANAGER`, `STAFF`. 
Roles are assigned per-user at the organization level.

**Rationale:** A kitchen has three clearly distinct user archetypes with wildly 
different needs and trust levels. Owners monitor margins, Managers engineer recipes, 
Line Cooks fill checklists. Mixing permissions leads to data corruption 
(e.g. a line cook accidentally changing an ingredient price).

**Consequence:** Every protected endpoint must check the user's role via a 
NestJS guard decorator (`@Roles('OWNER', 'MANAGER')`). The full RBAC matrix is 
documented in [personas-jtbd.md](./personas-jtbd.md).

---

## ADR-007: Single Currency per Organization (V1)

**Decision:** All monetary values are stored in a single currency defined at the 
`Organization` level (`currencyCode`, ISO 4217). The currency is set during onboarding 
and is immutable.

**Rationale:** Multi-currency adds enormous complexity (exchange rates, hedging, 
invoicing mismatches). For V1, the overwhelmingly common case is: one country = 
one currency. Multi-currency will be added in a future version if demand requires it.

**Consequence:** The `unitPrice` and `costPerBaseUnit` fields on `SupplierItem` are 
always in the org's currency. The UI displays the org's currency symbol everywhere.

---

## ADR-008: Internationalization (i18n) Strategy

**Decision:** The UI supports multiple languages via JSON translation files 
(`/locales/es.json`, `/locales/en.json`). The active locale is determined by 
the organization's `defaultLocale` field. System-managed data (category seeds) 
uses dedicated translation columns (`nameEs`, `nameEn`) in the database.

**Rationale:** openTrattOS targets the Spanish and international markets. A Spanish 
chef must see "Verduras de Hoja" while an English-speaking chef sees "Leafy Greens". 
User-generated content (ingredient names, recipe descriptions) is NOT translated — 
each organization writes in their own language.

**V1 Locales:** `es`, `en`  
**Future:** Community-contributed locale files for `fr`, `pt`, `it`, `de`.

---

## ADR-009: Soft Delete with Referential Integrity

**Decision:** Primary entities use `isActive` boolean for soft delete. Physical 
deletion is never performed except on full organization teardown.

**Rationale:** Recipes, compliance logs, and cost reports hold historical references 
to ingredients and suppliers. Hard-deleting an ingredient would break every recipe 
that used it. Soft delete preserves data integrity while keeping the UI clean.

**Rules:**
- Default list queries filter by `isActive = true`.
- Historical views show deactivated items with a "Discontinued" visual badge.
- Category deletion is `RESTRICT` — cannot delete a category that has children or ingredients.
- Reactivation is available to `OWNER` and `MANAGER` roles.

---

# Module 2 ADRs (added 2026-04-27 post-Gate-A approval of [PRD-2](./prd-module-2-recipes.md))

## ADR-010: M2 DDD Bounded Contexts

**Decision:** Module 2 introduces 4 new bounded contexts within the modular monolith
(per ADR-001):
- **Recipes** — Recipe + RecipeIngredient + cost rollup logic + cycle detection
- **Menus** — MenuItem + margin reporting
- **Labels** — EU 1169/2011 PDF rendering engine
- **Nutritional Catalog** — Open Food Facts mirror + lookup (extends Ingredients context)

The **Inventory** context is reserved as a Module 3 boundary; M2 reaches it only through
the `InventoryCostResolver` interface (ADR-011).

**Rationale:** Per ADR-001 each capability gets its own bounded context that can be
extracted to a microservice later without rewriting clients. M2 introduces 4 new
capabilities; they map cleanly to 4 contexts.

**Consequence:**
- Each context is self-contained: own entities, repositories, services, ports.
- Cross-context calls go through published interfaces (e.g. `RecipeReader` for Menus to read Recipe data).
- Cross-context entity imports are forbidden (lint rule per ADR-013).

---

## ADR-011: InventoryCostResolver as M2→M3 architectural seam

**Decision:** Define a `InventoryCostResolver` interface in the Recipes context with a
stable signature `resolveCost(ingredientId, sourceOverrideRef?) → CostPerBaseUnit`.
Implementations:
- **M2 (this module):** `M2DefaultCostResolver` returns the `isPreferred=true`
  `SupplierItem.unitPrice` for the ingredient (or the `sourceOverrideRef` if set).
- **M3 (Inventory + Batches, future):** `M3FifoBatchResolver` returns FIFO oldest-batch
  cost, preserving the same signature.

**Rationale:** Cost resolution must be replaceable without rewriting recipe rollup code.
By committing to this seam in M2, the M3 batch implementation drops in without touching
FR9/FR14 callers. Aligns with FIFO costing used by McDonald's, Sodexo, Aramark
(HACCP-aligned physical flow == accounting flow).

**Consequence:**
- Interface contract documented at `apps/api/src/recipes/cost/InventoryCostResolver.ts`
  with semver-style stability guarantee. Breaking changes require a deprecation cycle.
- "InventoryCostResolver API-stable" Technical Success KPI tracked from M2 ship to M3 launch.
- Cycle detection (ADR-014) and cost precision (ADR-015) co-evolve with this interface.

---

## ADR-012: Open Food Facts hybrid integration (local mirror + API fallback)

**Decision:** Open Food Facts data integrates as a **hybrid**:
- **Local mirror:** Postgres table `external_food_catalog` populated from the OFF weekly
  dump (~2-4 GB compressed). Active-passive table swap for zero-downtime sync.
- **REST API fallback:** `world.openfoodfacts.org/api/v3` queried on local cache miss
  or when local data is stale (>30 days for that product). Gated by
  `OPENTRATTOS_OFF_API_FALLBACK_ENABLED` feature flag.
- **Refresh job:** Cron, weekly. Atomic schema-versioned table swap.

**Rationale:** Local mirror gives <100ms p95 lookup (NFR target), zero network dependency
in the typical case, and ODbL-compliant usage (we use the data, we don't redistribute the
DB). API fallback covers freshly-released products + cache misses without forcing a daily sync.

**Consequence:**
- New table `external_food_catalog` indexed by barcode + name + brandName for fuzzy search.
- Sync script lives in `apps/api/src/nutrition-catalog/sync/` with weekly cron schedule.
- Compliance documented in `LICENSES.md` (ODbL: usage compliant; no redistribution of derived DB).
- If OFF service is degraded: local mirror keeps working for queries; sync retries next tick.
- If OFF disappears entirely: pivot to USDA FoodData Central + CIQUAL (smaller, generic-only) — documented in PRD §Risk Mitigations.

---

## ADR-013: MCP-server is Community core; specific agent runtimes stay BYO/Enterprise

**Decision:** The `opentrattos` MCP server (the contract surface that any
MCP-compatible agent connects to) ships in the **Community edition**. The specific AGENT
RUNTIMES (Hermes, OpenCode, Claude Desktop, custom) and the MEMORY LAYER (Hindsight)
remain Enterprise/BYO per the unchanged parts of ADR-005.

**Rationale:** ADR-005 conflated three concerns: (a) agent runtime, (b) memory layer,
(c) MCP contract surface. Contract surfaces are cheap to ship and define the integration
point. Community openTrattOS thus offers a standard MCP server out-of-the-box; Enterprise
customers (or any DIY user) plug their preferred agent into it.

**Rules enforced:**
- The MCP server is packaged as a **separate Docker image / npm module**, independent of
  `apps/api`. Lives in `packages/mcp-server/` (new package).
- `apps/api/` source code prohibited from importing `hermes-*`, `claude-*`, `opencode-*`,
  or any agent vendor packages. Enforced by `eslint-plugin-import` `no-restricted-paths`.
- Standalone deployment mode (no MCP server, no web chat widget) is fully functional via
  UI; switching to agent-integrated mode requires only env-var changes
  (`OPENTRATTOS_AGENT_ENABLED=true`) + container restart. Target operator time: ≤30 min.
- **Dual-mode CI**: full E2E suite runs in BOTH standalone and agent-integrated
  configurations on every PR.
- The MCP server passes the official MCP protocol test suite + conformance tests against
  ≥3 distinct clients (Hermes, OpenCode, Claude Desktop, raw Python MCP SDK).

**Consequence:** ADR-005 retains its Enterprise-only scope for Hermes/OpenCode runtimes
+ Hindsight + managed WhatsApp routing. M2 superseding clarification (this ADR): the
MCP CONTRACT SURFACE is OSS Community; the AGENT and MEMORY are not.

---

## ADR-014: Cycle detection on sub-recipe save (graph walk pre-commit)

**Decision:** Every Recipe save with sub-recipe additions performs a **graph walk**
before commit:
1. Build the dependency graph from the proposed Recipe (nodes = Recipes,
   edges = "uses sub-recipe").
2. DFS from the proposed Recipe; if any traversal returns to the proposed Recipe ID →
   cycle → reject with error naming both nodes and direction.
3. Hard depth cap at **10 levels**; deeper graphs reject with "recipe graph too deep,
   refactor".

**Rationale:** Sub-recipe cycles silently corrupt cost rollup (infinite recursion or
wrong totals). Pre-commit detection is cheaper than post-commit cleanup. Depth cap
prevents pathological cases without limiting realistic kitchens (most multi-level recipes
≤4 levels).

**Consequence:**
- Save endpoint becomes ~10ms slower for sub-recipe-heavy saves (negligible vs the 500ms
  cost recalc budget).
- Error message includes both nodes (per FR6) and direction so the chef understands
  without thinking.

---

## ADR-015: Cost calculation precision (4 decimal internal, 2 display, ≤0.01% tolerance)

**Decision:** All cost math uses:
- **4 decimal places internally** (Postgres `numeric(18,4)`)
- **2 decimal places for display** (rounded half-even via `Intl.NumberFormat`)
- **Tolerance budget:** ≤0.01% accumulated rollup error across recipes with up to 5
  sub-recipe levels and 30 ingredients

Backed by **100% unit test coverage** on the cost-calculation path (recipe rollup,
sub-recipe recursion, yield × waste math, currency rounding).

**Rationale:** Per PRD §Technical Success. Sub-recipe rollups multiply percentages;
without precision discipline, drift accumulates. The 0.01% tolerance is a hard contract
that all current and future implementations must respect.

**Consequence:**
- TypeORM column type for monetary fields: `numeric(18,4)`.
- Display layer rounds via `Intl.NumberFormat` half-even.
- ATDD scenarios cover the tolerance budget against hand-calculated reference values.

---

## ADR-016: No formal Recipe lifecycle states in MVP

**Decision:** Recipe entity has NO `status`/`lifecycle`/`state` field in M2 MVP. Drafts
are implicit: any Recipe with `isActive=true` and partial fields is "in progress"; once
required fields are present, it's "complete". State management is conversational
(FR42 `missingFields`/`nextRequired` in API responses), not persisted as enum states.

**Rationale:** Per PRD §Product Scope, recipe versioning is **Growth-tier (M2.1)**.
Lifecycle states (draft / published / archived) belong with versioning since they share
the same audit and reference semantics. Adding states to MVP without versioning support
would create a half-feature that needs revisiting.

**Consequence:**
- `Recipe.isActive` boolean stays the only state field (per ADR-009 soft-delete pattern).
- API responses for incomplete Recipes include FR42 `missingFields`/`nextRequired`
  metadata so agents (Hermes etc.) know what to ask for next.
- Future M2.1 versioning ADR will introduce the state machine AND immutable version
  snapshots together.

---

## ADR-017: Full EU 1169/2011 allergen handling (supersedes PRD-1 §4.11)

**Decision:** Allergens are first-class in M2:
- Stored on Ingredient (`allergens: text[]` from OFF or manual entry)
- Aggregated to Recipe level via **conservative inference** (ANY allergen on ANY
  ingredient bubbles up; never auto-clear)
- Rendered on labels with **Article 21 emphasis** (bold + contrast)
- Ingredient list ordered by **Article 18** (descending mass)
- Chef override at Recipe level with attribution + reason (`Manager+` role required)
- Recipe-level **"may contain traces of [allergen]"** cross-contamination free-text field
- **Pre-launch external legal review** of label template

This **supersedes [PRD-1 §4.11](./prd-module-1-ingredients.md)** which deferred allergens
to M3/M4.

**Rationale:** Per scope expansion at M2 PRD discovery (Module 5 absorption). With Open
Food Facts data the allergen tagging comes for free; deferring loses the value. EU 1169/2011
is non-negotiable for restaurant compliance in EU markets.

**Consequence:**
- M3 (Inventory) and M4 (HACCP) inherit the allergen pattern from M2 rather than
  introducing it from scratch.
- M2 budget includes label template + external legal review (~1-2 weeks of effort,
  identified by month 2 of M2 build per PRD §Resource Risks).
- Allergen overrides require `Manager+` per RBAC matrix update (PRD §SaaS B2B section).

---

## ADR-018: AI yield-suggestion model — gpt-oss-20b via OpenRouter, abstracted behind interface

**Decision:**
- **Model:** `gpt-oss-20b-rag` via the existing LiteLLM proxy → OpenRouter → Groq backend
  (the same model Hindsight already uses in production).
- **Abstraction:** Wrap the call in a `YieldSuggestionModel` interface so the
  implementation can be swapped without touching `RecipeIngredient` save logic.
- **Eval gate:** Pre-launch, run a 50-ingredient evaluation against USDA FoodData Central
  + CIA Pro Chef gold values; require ≥95% within 5pp of reference. If fail, swap
  implementation behind the interface.
- **Operational override:** Env var `OPENTRATTOS_AI_YIELD_MODEL` (default
  `gpt-oss-20b-rag`) allows ops-time model swap without code change.

**Rationale:** `gpt-oss-20b` is cheapest ($0.075/1M in, $0.30/1M out), already wired
through the per-consumer key isolation (`OPENROUTER_API_KEY_RAG`), and validated in
production by Hindsight. The interface gives us A/B-testing capability post-launch
without refactor.

**Consequence:**
- New per-consumer key NOT needed for MVP; reuses `OPENROUTER_API_KEY_RAG` budget.
- If post-launch acceptance rate (PRD KPI ≥70%) under-performs, swap model via env var
  without code change. Fallback candidate: `claude-haiku-hermes`.
- Every suggestion MUST carry a citation URL (per PRD FR19); this requirement is
  model-agnostic and lives in the interface contract.

---

## ADR-019: Label generation via @react-pdf/renderer

**Decision:** EU 1169/2011 labels render via `@react-pdf/renderer` — the React-based
PDF library — using shared shadcn-ish components (`AllergenBadge`, `MacroPanel`,
`IngredientList`, `LabelPreview`) that render identically in Storybook (designer review)
and in the PDF output (production).

**Rationale:** Same React tech stack as the UI; designers preview labels in Storybook
just like any other component (per the new UX track v0.5.0 spec from `ai-playbook`).
Performance is adequate for kitchen scale (~1 label/sec ≪ requirement). Article 21
emphasis (bold) is trivially supported.

**Consequence:**
- New package `packages/label-renderer` with React PDF components.
- Labels live alongside other UI components in Storybook (per UX track Component Library
  Curation pattern).
- **Fallback path documented**: if `@react-pdf/renderer`'s CSS limitations bite (some
  flexbox quirks reported by users), swap to Puppeteer / headless Chrome rendering an
  HTML template. The component-based approach (AllergenBadge etc.) survives the swap.

---

## ADR-020: Frontend stack — Vite + React 18 + TanStack Query + Tailwind 4 + Storybook 8

**Decision:** `apps/web/` is a Vite + React 18 SPA with TanStack Query 5, React Router 6, Tailwind 4, and shadcn-style primitives. `packages/ui-kit/` exports components as a workspace package with Storybook 8 (`@storybook/react-vite` framework) for static review. Storybook publishes to GitHub Pages on every push to `master` per ai-playbook ux-track.md §13.

**Rationale:**
- ADR-019 already locked React + Storybook + shadcn-ish. ADR-013 (Agent-Ready) makes the API the contract — no SSR required.
- Vite cold-start <1 s + sub-second HMR is the right shape for the kitchen-tablet developer feedback loop.
- TanStack Query's stale-while-revalidate semantics give the chef sub-200 ms refetch on cost / margin reads (NFR Performance).
- Tailwind 4 `@theme` block consumes OKLCH CSS variables directly from `packages/ui-kit/src/tokens.css` — no `tailwind.config.js` to keep in sync with `docs/ux/DESIGN.md`.
- shadcn copy-and-own (per ai-playbook §13) keeps Radix versioning in our control without a runtime dep on `@shadcn/ui`.
- One npm-workspaces monorepo with hoisting (verified with `@nestjs/event-emitter` migration in M2-followups) keeps lockfile + CI install times sane.

**Alternatives considered:**
- **Next.js 15 App Router**: rejected — SSR not needed, App Router learning cost adds slice budget for negligible benefit on private kitchen surfaces.
- **Remix / TanStack Start**: rejected — same SSR footprint as Next.js with worse Storybook integration as of 2026-05.
- **Astro with React islands**: rejected — misaligned with rich-interactive-surface UX (every kitchen screen is interactive).
- **Tailwind 3 + generated theme.json**: rejected in favour of Tailwind 4's `@theme` for tighter DESIGN.md ↔ runtime coupling. Documented fallback path in `m2-ui-foundation/design.md` Q1.
- **Material UI / Ant Design / Vanilla extract**: rejected — clash with the OKLCH-canonical token language or duplicate work shadcn already did.
- **SWR / RTK Query**: rejected — SWR weaker on mutations; RTK Query forces Redux.

**Consequence:**
- New `apps/web/` workspace + expanded `packages/ui-kit/` workspace.
- New `.github/workflows/storybook.yml` builds Storybook on every PR (advisory) + deploys to GitHub Pages on `master`. URL: `https://wizarck.github.io/openTrattOS/storybook/`.
- Per-component file layout codified in `packages/ui-kit/README.md` (one folder per component: tsx + stories + test + types + index).
- OKLCH-canonical CSS variables in `packages/ui-kit/src/tokens.css`; hex in `docs/ux/DESIGN.md` YAML frontmatter is a derivation snapshot only.
- Dev-time CORS handled by Vite proxy (`/api/*` → `http://localhost:3000`); production hits the real API URL via `VITE_API_URL`.

**Open follow-ups (filed in retro):**
- Tailwind 4 GA tracking (currently stable as of 2026-05, but watch for breaking changes through next minor).
- Codegen for backend DTOs → ui-kit types (manual hand-keeping today; risks drift).
- Per-PR Storybook previews via Chromatic / Vercel — deferred; Pages-on-master is sufficient for v0.

