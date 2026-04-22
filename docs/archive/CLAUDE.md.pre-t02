# CLAUDE.md — Project Context for AI Agents

> This file is the single source of truth for any AI agent (Claude, Cursor, Cline, etc.)
> working on the openTrattOS codebase. Read this FIRST before doing anything.

---

## 1. PROJECT IDENTITY

- **Name:** openTrattOS (Open Trattoria OS)
- **Tagline:** The Open Source Back-of-House (BOH) & Kitchen Traceability OS
- **Business Model:** Open-Core
  - **openTrattOS (Community):** Free, AGPL-3.0, self-hosted via Docker
  - **TrattOS (Enterprise):** Paid SaaS with AI agents, WhatsApp/Telegram bot, managed cloud
- **Repository:** https://github.com/Wizarck/openTrattOS
- **Local Path:** `C:\OpenTrattOS`
- **Jira (Enterprise only):** https://trattos.atlassian.net/
- **License:** AGPL-3.0

---

## 2. WHAT THIS PROJECT DOES

openTrattOS replaces expensive, closed-source restaurant back-of-house software
(like Apicbase, MarketMan, tSpoonLab, Gstock) with a beautiful, modern, open-source
alternative. It covers:

| Module | Description | Status |
|--------|-------------|--------|
| **M1: Foundation** | Ingredients, hierarchical categories, UoM conversions, suppliers & pricing | 🟢 In Progress |
| **M2: Food Costing** | Nested sub-recipes (escandallos), yield/waste, dynamic margin analysis | 🟡 Planned |
| **M3: HACCP/APPCC** | Batch tracking, traceability, digital checklists, label printing (Spanish health compliance) | 🟠 Planned |
| **M4: Operations** | Inventory counts, purchase orders, par-stock alerts, blind stock taking | 🔴 Planned |

---

## 3. TECH STACK

| Layer | Technology |
|-------|------------|
| **Monorepo** | Turborepo (npm workspaces) |
| **Frontend** | Next.js 14 + React + TypeScript + TailwindCSS |
| **Backend** | NestJS + TypeScript + Domain-Driven Design (DDD) |
| **Database** | PostgreSQL (TypeORM) |
| **Cache** | Redis |
| **File Storage** | MinIO / S3 |
| **AI (optional)** | Python FastAPI microservice (only if `AI_SERVICE_URL` is set) |
| **Governance** | BMAD-METHOD (Discovery) + OpenSpec (Implementation) |

---

## 4. ARCHITECTURE DECISIONS (CRITICAL — READ ALL)

There are 9 formal ADRs in `docs/architecture-decisions.md`. The most critical:

1. **ADR-001: Modular Monolith with DDD** — Single NestJS process, NOT microservices.
   Each module (ingredients, costing, haccp, operations) is a DDD Bounded Context.
   Cross-module communication via published interfaces, never direct entity imports.

2. **ADR-002: API-First for MCP Agents** — Every endpoint MUST be:
   - Semantically named (no `/process`, `/handle`)
   - Fully documented with `@ApiOperation` Swagger decorators
   - Explicitly typed DTOs (NEVER use `any`)
   - Cursor-based pagination on all list endpoints
   - Designed so an LLM agent can understand the tool from name + description alone

3. **ADR-004: Multi-Tenant from Day One** — ALL tables have `organizationId` FK.

4. **ADR-006: RBAC** — Three roles: `OWNER`, `MANAGER`, `STAFF`.
   See `docs/personas-jtbd.md` for the full permission matrix.

5. **ADR-007: Single Currency per Org** — `currencyCode` is set once, immutable.

6. **ADR-008: i18n** — UI uses JSON translation files (`es.json`, `en.json`).
   Category seeds have `nameEs` + `nameEn` columns.

7. **ADR-009: Soft Delete** — `isActive` boolean, never physical delete.
   Categories use RESTRICT (can't delete if children/ingredients exist).

---

## 5. MONOREPO STRUCTURE

```
C:\OpenTrattOS\
├── apps/
│   ├── api/                        # NestJS backend (TypeScript, DDD)
│   │   └── src/
│   │       ├── main.ts             # Entry + Swagger setup
│   │       ├── app.module.ts       # Root module
│   │       └── ingredients/        # Bounded Context M1
│   │           ├── domain/         # Entities, Value Objects (PURE business logic)
│   │           ├── application/    # Use cases + port interfaces
│   │           ├── infrastructure/ # TypeORM repositories, seeds
│   │           └── interface/      # Controllers, DTOs (HTTP layer)
│   └── web/                        # Next.js frontend (NOT YET CREATED)
│
├── packages/
│   └── types/                      # @opentrattos/types — shared DTOs
│       └── src/
│           ├── uom.ts              # UoM engine (families, conversions, factors)
│           ├── ingredient.ts       # Ingredient + SupplierItem + PaginatedResponse
│           ├── category.ts         # Hierarchical category tree DTOs
│           ├── supplier.ts         # Supplier DTOs
│           ├── organization.ts     # Organization + Location DTOs
│           └── user.ts             # User + UserRole enum (RBAC)
│
├── openspec/                       # OpenSpec workflow
│   └── changes/
│       └── module-1-ingredients-implementation/  # ACTIVE CHANGE — resume here
│
├── docs/
│   ├── prd-module-1-ingredients.md     # PRD v2.0 (approved)
│   ├── architecture-decisions.md       # 9 ADRs
│   ├── data-model.md                   # ERD (Mermaid) + cascade rules
│   ├── personas-jtbd.md                # 3 user personas + RBAC matrix + onboarding flow
│   └── project-structure.md            # Full directory map
│
├── _bmad/                          # BMAD-METHOD agents & config
│   └── _config/agents/
│       └── ui_ux_architect.md      # Custom ROCTTOC persona for UI/UX
│
├── turbo.json                      # Turborepo pipeline
├── package.json                    # Root workspace
├── LICENSE                         # AGPL-3.0
└── README.md                       # GitHub-ready with badges, roadmap, contributing
```

---

## 6. CURRENT STATE — WHERE WE LEFT OFF

### Completed:
- [x] BMAD Discovery phase (PRD, ADRs, ERD, Personas, RBAC)
- [x] PM SaaS Review (7 gaps identified and fixed)
- [x] GitHub repo created and pushed (3 commits)
- [x] OpenSpec initialized (spec-driven schema)
- [x] Turborepo + NestJS skeleton scaffolded
- [x] `@opentrattos/types` fully defined (all M1 DTOs)
- [x] Controller skeletons with Swagger decorators

### IN PROGRESS — Resume Here:
- [ ] **OpenSpec change `module-1-ingredients-implementation`** was just created
  - The `proposal.md` artifact is `ready` and needs to be written
  - After proposal: `design.md` and `specs/*.md` unlock
  - After those: `tasks.md` unlocks
  - After tasks: run `openspec apply` to start implementation
  - **USE OPENSPEC CLI** for all implementation work. Do NOT freestyle code.

### NOT YET DONE:
- [ ] `npm install` has not been run yet (no node_modules)
- [ ] `apps/web/` (Next.js frontend) has not been created yet
- [ ] Domain entities, use cases, and repositories are empty shells (TODO comments)
- [ ] Database connection (TypeORM) not configured yet
- [ ] Docker Compose not created yet

---

## 7. WORKFLOW RULES (MANDATORY)

### For Discovery & Planning:
Use **BMAD-METHOD** agents. The PM asks questions, the Architect makes decisions.
Do NOT skip the human in the loop.

### For Implementation:
Use **OpenSpec** CLI exclusively:
```bash
# See what needs to be done
npx @fission-ai/openspec@latest status --change "module-1-ingredients-implementation"

# Get instructions for next artifact
npx @fission-ai/openspec@latest instructions <artifact-id> --change "module-1-ingredients-implementation" --json

# When all artifacts are done, implement
npx @fission-ai/openspec@latest apply --change "module-1-ingredients-implementation"
```

### Code Style:
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- **No `any` types** — ever. Use explicit DTOs from `@opentrattos/types`.
- **Every endpoint** gets `@ApiOperation` with summary + description.
- **4 decimal places** for money internally, 2 for display.
- **UoM conversions**: same-family = auto, cross-family WEIGHT↔VOLUME = blocked unless `densityFactor` set, any↔UNIT = always blocked.

---

## 8. ENTERPRISE VISION (DO NOT IMPLEMENT — Context Only)

TrattOS Enterprise will add:
- **AI Agents** (Hermes/OpenClaw) consuming the API via MCP Tools
- **Memory** (Hindsight) for contextual conversations
- **Messaging** (WhatsApp/Telegram) so kitchen staff can query inventory by chat
- **Orchestration** (LangGraph) for complex workflows
- **Infrastructure** (Rancher/Kubernetes) for managed cloud deployment

This is why ADR-002 (MCP-ready API) exists. Design every endpoint as if an LLM
will read its Swagger description and decide whether to call it.

---

## 9. KEY URLS

| Resource | URL |
|----------|-----|
| GitHub Repo | https://github.com/Wizarck/openTrattOS |
| Jira (Enterprise) | https://trattos.atlassian.net/ |
| OpenSpec Docs | https://github.com/Fission-AI/OpenSpec |
| BMAD-METHOD Docs | https://github.com/bmad-code-org/BMAD-METHOD |
| BMAD Website | https://bmadcode.com/ |
