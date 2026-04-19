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
