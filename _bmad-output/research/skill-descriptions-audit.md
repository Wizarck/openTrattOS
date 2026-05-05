---
title: Skill descriptions audit — openTrattOS / .claude/skills/
date: 2026-04-28
purpose: Curated review of `check_skill_descriptions.py` v0.7.0 lint output. Informs the v0.8.0 batch-rewrite decision per `specs/v0.8.0-roadmap.md` item 7.
status: review
parent: _bmad-output/research/
---

# Skill descriptions audit

The lint (`check_skill_descriptions.py` v0.7.0) flagged **88 suspicious descriptions** across `.claude/skills/`. The lint applies surface heuristics (verb-led first sentence, `through`/`scaffold` workflow-mechanics phrasing, missing literal `"Use when"` substring), not semantic CSO compliance. Per `.ai-playbook/specs/skills-distribution.md` §1 (v0.7.0+), the `description` frontmatter must tell the LLM **when** to invoke the skill (trigger + intent), never summarise the workflow.

This dossier separates true positives from false positives across three categories:

- **False positive** — description has a clear "Use when" / equivalent clause that gives the LLM a real trigger; verb-led titling sentence is acceptable framing. No rewrite needed.
- **True positive** — description is a workflow summary or capability blurb with no actionable trigger clause (or only a fake one that re-states the summary). Rewrite proposed.
- **Edge case** — mixed signals; flagged for Master to decide at v0.8.0.

A critical finding emerged during inspection: **50 of the 88 lint hits are caused by a parser bug in `check_skill_descriptions.py`** (the original audit estimated 47 — verified post-hoc as 50 by counting `^description: >` occurrences across `.claude/skills/*/SKILL.md`). When a SKILL.md uses YAML folded-scalar syntax (`description: >\n  ...body...`), the linter's regex-based frontmatter parser records the literal string `'>'` as the description and then complains about it. The actual descriptions are well-formed and almost always CSO-compliant. These should not be counted as skill defects; the lint must be fixed in v0.8.0 before the batch rewrite is meaningful.

**Coverage note**: this dossier provides per-skill detail for the **48 skills** whose findings were NOT just the parser-bug class (all 18 true positives, all 5 edge cases, plus 25 false positives that fired on substantive lint patterns like verb-led summaries with valid `Use when` clauses). The remaining **40 skills** (`bc-to-pptx`, `catalogue`, `commercial-playbook`, `context7`, `cpq`, `customer`, `datasheet`, `defuddle`, `docx`, `intel`, `json-canvas`, `kickoff`, `market-intel`, `obsidian-bases`, `obsidian-cli`, `obsidian-markdown`, `pdf`, `poc`, `pot`, `pptx`, `pptx-template`, `qa-catalogue`, `qa-consistency`, `qa-financial`, `qa-improve`, `qa-od`, `qa-poc`, `qa-pot`, `qa-pptx`, `qa-research`, `qa-sd`, `qa-strategy`, `qa-use-cases`, `research`, `skill-creator`, `start`, `strategy`, `sync-jira`, `use-case-research`, `xlsx`) are **all parser-bug victims only** — verified by `grep -l "^description: >"`. They show up in the lint output as `description: '>'` and disappear once the parser is fixed. No per-skill entries needed because the rewrite is "fix the parser", not "rewrite the description". (These are the eligia-skills source-repo family that uses folded-scalar consistently.)

## Summary

| Category | Count | What it means |
|---|---|---|
| False positive — parser bug (no rewrite needed) | 50 | Folded-scalar YAML; lint reads `'>'` literal. Disappears when parser is fixed (P0). |
| False positive — surface-pattern heuristic over-fires | 15 | Descriptions with valid "Use when" clauses that tripped the verb-led / `through` / `scaffold` heuristics. The lint should be tuned (P1). |
| True positive (rewrite proposed) | 18 | Descriptions that are workflow summaries or capability blurbs with no when-to-use trigger. Rewrite in v0.8.0 P2 batch. |
| Edge case (Master decides) | 5 | Mixed signals — verb-led summary with weak when-clause, or short capability statement that may be acceptable as-is. |
| **Total findings** | 88 | |

## Recommended action for v0.8.0

The v0.8.0 batch rewrite is **smaller than the lint suggests, and gated by a lint fix**. Three decisions for Master:

1. **Fix the lint first (P0).** The folded-scalar bug is the dominant signal: 47/88 hits (53%) are spurious. Until the linter loads YAML properly (`yaml.safe_load` of frontmatter, not regex) the noise overwhelms the signal. Rough effort: 30 min in `scripts/check_skill_descriptions.py`.
2. **Tune the lint heuristics (P1).** A verb-led first sentence followed by a "Use when …" clause is CSO-compliant per the obra/superpowers pattern (see `bmad-agent-builder` example in the task brief). The lint should treat `^verb …\. Use when …` as compliant. `through` and `scaffold` should not fire when a "Use when" clause is present. Rough effort: 1 h.
3. **Apply the 18 true-positive rewrites in a single focused PR.** All 18 are descriptions only, single sentences each, no behaviour change — rollback is trivial. Estimated effort once Master approves the proposed wording: ~45 min mechanical edit + lint re-run. Recommend Master approve the proposed batch as drafted below.

Of the 18 true positives, 9 are duplicate-template skills (the four `shadcn-*`, plus `code-refactorer`, `code-reviewer`, `staff-engineer`, `system-architect`, `premium-ux-designer`, `product-strategy-advisor`, `git-commit-helper` — all carry generic "Specialist agent that …" capability blurbs from a shared template). Fixing the SKILL.md template is the high-leverage move; per-skill rewrites follow.

## Findings by skill family

### `bmad-create-*` (PRD / architecture / story creation)

#### `bmad-create-architecture` False positive
- **Original**: *"Create architecture solution design decisions for AI agent consistency. Use when the user says \"lets create architecture\" or \"create technical architecture\" or \"create a solution design\""*
- **Lint pattern**: starts with summary verb (`Create`).
- **Why no rewrite**: the "Use when the user says …" clause is concrete, multi-trigger, and gives the LLM exactly the phrases to listen for. The lead verb is titling, not a summary that invites short-circuit.

#### `bmad-create-prd` Edge case
- **Original**: *"Create a PRD from scratch. Use when the user says \"lets create a product requirements document\" or \"I want to create a new PRD\""*
- **Lint pattern**: starts with summary verb (`Create`).
- **Ambiguity**: the "Use when the user says" clause is a literal echo of the lead summary ("Create a PRD …" + "create a new PRD"). Marginally acceptable because it gives the LLM trigger phrases, but the brief's good-example wording (*"Use when the user wants to start a new module's discovery phase and produce its product requirements document"*) is stronger because it frames around user intent. Flag for Master.

#### `bmad-create-story` False positive
- **Original**: *"Creates a dedicated story file with all the context the agent will need to implement it later. Use when the user says \"create the next story\" or \"create story [story identifier]\""*
- **Lint pattern**: starts with summary verb (`Creates`).
- **Why no rewrite**: clear multi-phrase "Use when the user says" clause with template placeholder. Lead sentence adds useful context (file with implementation context) — not a workflow summary.

### `bmad-agent-*` and `bmad-workflow-*` (builder skills)

#### `bmad-agent-builder` False positive
- **Original**: *"Builds, edits or analyzes Agent Skills through conversational discovery. Use when the user requests to \"Create an Agent\", \"Analyze an Agent\" or \"Edit an Agent\"."*
- **Lint pattern**: starts with summary verb (`Builds`); contains `through`.
- **Why no rewrite**: the brief explicitly cites this as the canonical false positive. Three concrete trigger phrases.

#### `bmad-workflow-builder` False positive
- **Original**: *"Builds, converts, and analyzes workflows and skills. Use when the user requests to \"build a workflow\", \"modify a workflow\", \"quality check workflow\", \"analyze skill\", or \"convert a skill\"."*
- **Lint pattern**: starts with summary verb (`Builds`).
- **Why no rewrite**: five concrete trigger phrases; lead verb is titling.

### `bmad-cis-*` (creative innovation skills)

#### `bmad-cis-problem-solving` False positive
- **Original**: *"Apply systematic problem-solving methodologies to complex challenges. Use when the user says \"guide me through structured problem solving\" or \"I want to crack this challenge with guided problem solving techniques\""*
- **Lint pattern**: contains `through` (in the user's quoted phrase, not the description itself).
- **Why no rewrite**: the `through` is inside a user-quoted trigger phrase. Two trigger phrases. The lint should be tuned to ignore `through` inside quotation marks.

#### `bmad-cis-storytelling` False positive
- **Original**: *"Craft compelling narratives using story frameworks. Use when the user says \"help me with storytelling\" or \"I want to create a narrative through storytelling\""*
- **Lint pattern**: contains `through` (in user-quoted phrase).
- **Why no rewrite**: same as above — `through` is in the user trigger phrase, not in workflow-mechanics description.

### `bmad-testarch-*` (test architecture)

All five `bmad-testarch-*` findings are false positives. They follow the same shape: summary verb (`Generate`/`Scaffold`/`Create`) + `Use when the user says "X" or "I want to Y"`.

#### `bmad-testarch-atdd` False positive
- **Original**: *"Generate red-phase acceptance test scaffolds using the TDD cycle. Use when the user says \"lets write acceptance tests\" or \"I want to do ATDD\""*
- **Lint pattern**: starts with summary verb (`Generate`); contains `scaffold`.
- **Why no rewrite**: `scaffold` is the legitimate testing-domain noun (test scaffolds), not workflow-mechanics phrasing. Two trigger phrases.

#### `bmad-testarch-ci` False positive
- **Original**: *"Scaffold CI/CD quality pipeline with test execution. Use when the user says \"lets setup CI pipeline\" or \"I want to create quality gates\""*
- **Lint pattern**: contains `scaffold`.
- **Why no rewrite**: `scaffold` here is a verb meaning "set up the structure of". Two trigger phrases.

#### `bmad-testarch-test-design` False positive
- **Original**: *"Create system-level or epic-level test plans. Use when the user says \"lets design test plan\" or \"I want to create test strategy\""*
- **Lint pattern**: starts with summary verb (`Create`).
- **Why no rewrite**: clear two-phrase "Use when the user says" trigger.

#### `bmad-testarch-trace` False positive
- **Original**: *"Generate traceability matrix and quality gate decision. Use when the user says \"lets create traceability matrix\" or \"I want to analyze test coverage\""*
- **Lint pattern**: starts with summary verb (`Generate`).
- **Why no rewrite**: clear two-phrase "Use when the user says" trigger.

#### `bmad-teach-me-testing` False positive
- **Original**: *"Teach testing progressively through structured sessions. Use when user says \"lets learn testing\" or \"I want to study test practices\""*
- **Lint pattern**: contains `through`.
- **Why no rewrite**: `through structured sessions` is a meaningful framing of the skill's mode (multi-session, not one-shot), not workflow mechanics. Two trigger phrases.

### `bmad-*` (remaining single skills)

#### `bmad-checkpoint-preview` False positive
- **Original**: *"LLM-assisted human-in-the-loop review. Make sense of a change, focus attention where it matters, test. Use when the user says \"checkpoint\", \"human review\", or \"walk me through this change\"."*
- **Lint pattern**: contains `through` (in user phrase `walk me through this change`).
- **Why no rewrite**: `through` is in a quoted user trigger. Three concrete user phrases.

#### `bmad-create-prd` (already covered as edge case above)

#### `bmad-dev-story` False positive
- **Original**: *"Execute story implementation following a context filled story spec file. Use when the user says \"dev this story [story file]\" or \"implement the next story in the sprint plan\""*
- **Lint pattern**: starts with summary verb (`Execute`).
- **Why no rewrite**: two concrete trigger phrases including templated argument.

#### `bmad-generate-project-context` False positive
- **Original**: *"Create project-context.md with AI rules. Use when the user says \"generate project context\" or \"create project context\""*
- **Lint pattern**: starts with summary verb (`Create`).
- **Why no rewrite**: two trigger phrases. Tight.

#### `bmad-index-docs` Edge case
- **Original**: *"Generates or updates an index.md to reference all docs in the folder. Use if user requests to create or update an index of all files in a specific folder"*
- **Lint pattern**: starts with `Generates`; "missing when-to-use indicator" — though "Use if user requests to" is semantically equivalent to "Use when the user wants".
- **Ambiguity**: The lint's `Use when` substring check is too strict — `Use if user requests to` is fine semantically. But the trigger restates the lead ("create or update an index"), which is weak. Master could either accept as-is (after lint tuning) or rewrite to *"Use when the user wants an index.md generated or refreshed for a docs folder"*. Flag.

#### `bmad-product-brief` False positive
- **Original**: *"Create or update product briefs through guided or autonomous discovery. Use when the user requests to create or update a Product Brief."*
- **Lint pattern**: starts with `Create`; contains `through`.
- **Why no rewrite**: clear "Use when the user requests" trigger. The `through guided or autonomous discovery` adds a useful mode hint (skill operates in two modes). Acceptable.

#### `bmad-qa-generate-e2e-tests` False positive
- **Original**: *"Generate end to end automated tests for existing features. Use when the user says \"create qa automated tests for [feature]\""*
- **Lint pattern**: starts with `Generate`.
- **Why no rewrite**: concrete templated trigger phrase. Tight.

#### `bmad-shard-doc` Edge case
- **Original**: *"Splits large markdown documents into smaller, organized files based on level 2 (default) sections. Use if the user says perform shard document"*
- **Lint pattern**: missing `Use when` substring.
- **Ambiguity**: trigger phrase `Use if the user says perform shard document` is grammatically rough; `perform shard document` is awkward. Functionally a trigger but reads poorly. Flag for Master — could be tightened to *"Use when the user asks to shard a large markdown document into per-section files"*.

#### `bmad-sprint-planning` False positive
- **Original**: *"Generate sprint status tracking from epics. Use when the user says \"run sprint planning\" or \"generate sprint plan\""*
- **Lint pattern**: starts with `Generate`.
- **Why no rewrite**: two clear trigger phrases.

### `openspec-*`

#### `openspec-apply-change` False positive
- **Original**: *"Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks."*
- **Lint pattern**: contains `through` (in `work through tasks`).
- **Why no rewrite**: clear three-condition "Use when" clause; `work through tasks` is a natural English expression, not workflow mechanics.

#### `openspec-explore` False positive
- **Original**: *"Enter explore mode - a thinking partner for exploring ideas, investigating problems, and clarifying requirements. Use when the user wants to think through something before or during a change."*
- **Lint pattern**: contains `through` (`think through something`).
- **Why no rewrite**: idiomatic English (`think through`); strong "Use when the user wants" clause.

### Folded-scalar parser bug (47 skills)

These 47 skills all use YAML folded-scalar syntax (`description: >` followed by indented multi-line text). The lint reads the literal `'>'` character as the description and produces a meaningless "missing when-to-use indicator" warning. **All 47 are false positives at the lint level.** The actual descriptions, sampled below, are virtually all CSO-compliant.

| Skill | Actual description (excerpt) | CSO compliant? |
|---|---|---|
| `bc-to-pptx` | "… Pipeline: Extract BC data -> validate … Use after LEAN_BUSINESS_CASE.md is approved …" | Yes |
| `catalogue` | "Designs portfolio entries … Use when designing products, services …" | Yes |
| `check-updates` | "Checks all ELIGIA stack components … Sends formatted report via WhatsApp." | **No — capability blurb, no Use when** |
| `commercial-playbook` | "Develops COMMERCIAL_PLAYBOOK.md: pricing architecture … Use when creating or updating commercial playbooks …" | Yes |
| `context7` | "Fetch up-to-date library documentation via Context7 MCP. … Use when implementing features with libraries that change frequently …" | Yes |
| `cpq` | "Produces CPQ_CALCULATOR.xlsx spec: pricing calculator tool … Use when creating CPQ pricing calculators …" | Yes |
| `customer` | "Provides segment and persona expertise … Use when analyzing target segments …" | Yes |
| `datasheet` | "Produces DATASHEET.md: customer-facing technical sheet … Use when creating or updating datasheets …" | Yes |
| `defuddle` | "Extract clean markdown from web pages … Use instead of WebFetch when the user provides a URL …" | Yes |
| `develop` | "Orchestrates step-by-step offering development … Coordinates other agents …" | **No — workflow summary, no Use when** |
| `doc-coauthoring` | "Guides users through structured workflow for co-authoring documentation, proposals, technical specs." | **No — capability blurb, no Use when** |
| `docx` | "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents …" | Yes (Use whenever) |
| `enablement` | "Develops Pre-Sale, Sales, and Ops Enablement Plans … Reads BU intelligence …" | **No — workflow summary, no Use when** |
| `ideation-deck` | "Creates the Ideation Deck — a draft Sales Enablement Deck … Produced at Step 10 …" | **No — describes pipeline position, not trigger** |
| `intel` | "Loads strategic and market intelligence context silently. Use this skill whenever working on offerings …" | Yes |
| `json-canvas` | "Create and edit Obsidian JSON Canvas (.canvas) files … Use when working with .canvas files …" | Yes |
| `kickoff` | "Web research agent that populates 00_Research/ files … Run FIRST when starting a new offering …" | Yes (`Run FIRST when` is a trigger) |
| `market-intel` | "Processes global market research inputs … Run when new reports are added to …" | Yes (`Run when`) |
| `mcp-builder` | "Guide for creating MCP (Model Context Protocol) servers in Python (FastMCP) or Node/TypeScript." | **No — capability blurb, no Use when** |
| `monetization` | "Develops the Monetization Model for offerings: pricing architecture, rate cards, CPQ configuration …" | **No — workflow summary, no Use when** |
| `nuevo-lote` | "Registra un nuevo lote de producción de pastelitos maracuchos. Asigna número de lote …" | **No — Spanish, workflow summary, no Use when** |
| `obsidian-bases` | "Create and edit Obsidian Bases (.base files) … Use when working with .base files …" | Yes |
| `obsidian-cli` | "Interact with Obsidian vaults using the Obsidian CLI … Use when the user asks to interact …" | Yes |
| `obsidian-markdown` | "Create and edit Obsidian Flavored Markdown … Use when working with .md files in an Obsidian vault …" | Yes |
| `pdf` | "Use this skill whenever the user wants to do anything with PDF files." | Yes |
| `poc` | "Proof of Concept evaluation: plan and execute customer pilots … Use when creating or updating a POC.md …" | Yes |
| `pot` | "Develops Proof of Technology (POT) documents … Use when creating or updating a POT.md …" | Yes |
| `pptx` | "Use this skill any time a .pptx file is involved in any way …" | Yes |
| `pptx-template` | "Interactive PPTX template builder and maintainer. Two modes: CREATE … UPDATE … Use when preparing a new PPTX template …" | Yes |
| `qa-catalogue` | "Validates Unified Catalogue compliance … Use after creating or updating catalogue entries …" | Yes |
| `qa-consistency` | "Validates cross-document consistency … Use after completing multiple documents for the same offering." | Yes |
| `qa-enablement` | "Validates enablement plans (SALES, PRE_SALE, OPS): BU data alignment, delivery center consistency …" | **No — capability blurb, no Use when** |
| `qa-financial` | "Validates financial calculations … Use after creating or updating LEAN_BUSINESS_CASE.md financial sections." | Yes |
| `qa-improve` | "Analyzes the GTM-Helper AI architecture with 3 operating modes … Use after correcting errors …" | Yes |
| `qa-od` | "Validates Offer Description completeness … Use after creating or updating OFFER_DESCRIPTION.md." | Yes |
| `qa-poc` | "Validates Proof of Concept completeness … Use after creating or updating a POC.md document." | Yes |
| `qa-pot` | "Validates Proof of Technology (POT) documents … Use after creating or updating a POT.md document." | Yes |
| `qa-pptx` | "Validates PPTX slide content and visual quality … Called by /bc-to-pptx during generation. Can also be invoked standalone …" | Edge — describes invocation context but not user trigger |
| `qa-research` | "Validates research data integrity … Use after processing new research inputs …" | Yes |
| `qa-sd` | "Validates Service Design … Use after creating or updating SERVICE_DESIGN.md or OPERATIONAL_PLAYBOOK.md." | Yes |
| `qa-strategy` | "Validates strategy alignment … Use after creating or updating 01_BS/ business strategy documents." | Yes |
| `qa-use-cases` | "Validates Use Cases CSV format compliance … Use after creating or updating a Use Cases CSV." | Yes |
| `research` | "Processes research inputs and synthesizes intelligence … Use when new research materials are added …" | Yes |
| `service` | "Develops Solution Design (SoD), Service Design (SD), Operational Playbook (OP) … Two-phase: Draft in Formulation …" | **No — workflow summary, no Use when** |
| `skill-creator` | "Creates new skills, modifies existing skills … Use when creating a skill from scratch …" | Yes |
| `start` | "Starts the full MCP stack … Use /start at the beginning of any session where MCP tools are needed …" | Yes |
| `strategy` | "Tunes business strategy and aligns with corporate ABC Goals. Use when working on 01_BS/ business strategy files." | Yes |
| `sync-jira` | "Two-way sync between PROGRESS.md pipeline status and JIRA CIT tasks. Use when syncing offering progress …" | Yes |
| `use-case-research` | "Creates JTBD-aligned Use Cases CSVs … Use when creating or updating use case research for an offering." | Yes |
| `xlsx` | "Use this skill any time a spreadsheet file is the primary input or output." | Yes |

**Of the 47 folded-scalar hits**: 39 are CSO-compliant (false positives even after the lint bug is fixed); **8 are real true positives** that need rewriting (`check-updates`, `develop`, `doc-coauthoring`, `enablement`, `ideation-deck`, `mcp-builder`, `monetization`, `nuevo-lote`, `qa-enablement`, `service`). They appear under their respective skill-family entries below — moved out of this table for the rewrite proposals.

### Folded-scalar **true positives** (rewrites proposed)

#### `check-updates` True positive
- **Original**: *"Checks all ELIGIA stack components for available updates (Docker images, Python packages, git repos, skills-manager.exe, Hermes, npm). Applies safe Docker updates with healthcheck and automatic rollback. Sends formatted report via WhatsApp."*
- **Proposed**: *"Use when the user wants to check the ELIGIA stack for outdated components and apply safe updates with rollback."*
- **Rationale**: original is a three-sentence capability description. Proposed gives a single clear trigger.

#### `develop` True positive
- **Original**: *"Orchestrates step-by-step offering development following the modular analysis framework. Coordinates other agents for complete offering development from research through business case."*
- **Proposed**: *"Use when the user wants to start or resume end-to-end development of a Marlink offering through the full modular pipeline."*
- **Rationale**: original is workflow summary. Proposed reframes around the user's intent (start/resume).

#### `doc-coauthoring` True positive
- **Original**: *"Guides users through structured workflow for co-authoring documentation, proposals, technical specs."*
- **Proposed**: *"Use when the user wants a structured co-authoring session to draft documentation, proposals, or technical specs."*
- **Rationale**: capability blurb → user-intent trigger.

#### `enablement` True positive
- **Original**: *"Develops Pre-Sale, Sales, and Ops Enablement Plans for offerings (replaces old CE+TE). Reads BU intelligence, delivery center model, and offering context to produce PRE_SALE_ENABLEMENT.md, SALES_ENABLEMENT_PLAYBOOK.md, and OPS_ENABLEMENT.md. Also produces BATTLECARD.md and ONE_PAGER.md as independent JIRA-trackable deliverables. Includes capability-to-enablement mapping for certifications and profiles."*
- **Proposed**: *"Use when the user wants to create or refresh an offering's enablement plans (Pre-Sale, Sales, Ops) plus battlecard and one-pager."*
- **Rationale**: original is a 4-sentence pipeline summary. Proposed states the trigger and what the user gets.

#### `ideation-deck` True positive
- **Original**: *"Creates the Ideation Deck — a draft Sales Enablement Deck used to pitch the offering idea to an internal board before PoT/PoC validation. Produced at Step 10 (end of Exploration, before RFE milestone). Complementary to BS .pptx."*
- **Proposed**: *"Use when the user wants to draft an Ideation Deck to pitch a new offering to the internal board at end of Exploration."*
- **Rationale**: pipeline-position summary → user-intent trigger.

#### `mcp-builder` True positive
- **Original**: *"Guide for creating MCP (Model Context Protocol) servers in Python (FastMCP) or Node/TypeScript."*
- **Proposed**: *"Use when the user wants to scaffold a new MCP server in Python (FastMCP) or Node/TypeScript."*
- **Rationale**: capability blurb → user-intent trigger.

#### `monetization` True positive
- **Original**: *"Develops the Monetization Model for offerings: pricing architecture, rate cards, CPQ configuration, billing operations, channel & partner economics, sales incentives, and contract framework. Source of truth for commercial operations — BC §5.7-5.8 are summaries referencing this document."*
- **Proposed**: *"Use when the user wants to design or update the monetization model (pricing, rate cards, CPQ, billing, partner economics) for an offering."*
- **Rationale**: workflow summary → user-intent trigger.

#### `nuevo-lote` True positive (and Spanish)
- **Original**: *"Registra un nuevo lote de producción de pastelitos maracuchos. Asigna número de lote automáticamente, recoge datos reales de ingredientes, masa, rendimiento y QA, calcula costes y genera un fichero de registro en 01_produccion/data/lotes/."*
- **Proposed (Spanish, matching project style)**: *"Úsalo cuando el usuario quiere registrar un nuevo lote de producción de pastelitos y obtener su ficha de costes y QA."*
- **Rationale**: workflow summary → user-intent trigger. Note: language is Spanish — flag for Master whether the project standard is bilingual or English-only descriptions. (See Open questions.)

#### `qa-enablement` True positive
- **Original**: *"Validates enablement plans (SALES, PRE_SALE, OPS): BU data alignment, delivery center consistency, TCO completeness, capacity model soundness, capability mapping coverage."*
- **Proposed**: *"Use when the user wants to validate an offering's enablement plans (SALES / PRE_SALE / OPS) for BU and TCO consistency."*
- **Rationale**: capability list → user-intent trigger. (Sister skills `qa-od`, `qa-financial`, etc. all follow the `Use after creating …` pattern; this one missed it.)

#### `service` True positive
- **Original**: *"Develops Solution Design (SoD), Service Design (SD), Operational Playbook (OP), and Offer Description (OD) documents step-by-step. SoD covers architectural design (HLD/LLD); SD covers TMF decomposition (CFS/RFS/Resources). Two-phase: Draft in Formulation, Final in Execution."*
- **Proposed**: *"Use when the user wants to draft or finalise an offering's SoD, SD, Operational Playbook, or Offer Description documents."*
- **Rationale**: pipeline summary → user-intent trigger.

### Other (templated capability-blurb skills)

The next eight skills all share a common template defect: a capability description with no trigger clause. Several are duplicates of the same blurb across the `shadcn-*` family.

#### `code-refactorer` True positive
- **Original**: *"Improves code quality by cleaning up messy code, enhancing readability, optimizing performance, and increasing maintainability through systematic refactoring"*
- **Proposed**: *"Use when the user wants to clean up, refactor, or improve the readability and maintainability of existing code."*
- **Rationale**: capability blurb → user-intent trigger.

#### `code-reviewer` True positive
- **Original**: *"Senior-level code review agent that evaluates code quality across bug detection, security, performance, maintainability, testing coverage, and architectural design"*
- **Proposed**: *"Use when the user wants a senior-level review of code for bugs, security, performance, maintainability, and architecture."*
- **Rationale**: capability blurb → user-intent trigger.

#### `git-commit-helper` True positive
- **Original**: *"Creates clear, conventional commit messages following best practices with semantic versioning awareness and detailed change descriptions"*
- **Proposed**: *"Use when the user wants a conventional-commit message drafted for staged changes."*
- **Rationale**: capability blurb → user-intent trigger.

#### `premium-ux-designer` True positive
- **Original**: *"Creates exceptional user experiences with user-centered design, accessibility compliance, and modern UI patterns for web and mobile applications"*
- **Proposed**: *"Use when the user wants UX design guidance, wireframes, or accessibility review for a web or mobile feature."*
- **Rationale**: capability blurb → user-intent trigger.

#### `product-strategy-advisor` True positive
- **Original**: *"Provides strategic product guidance with market analysis, feature prioritization, roadmap planning, and user-centric decision making"*
- **Proposed**: *"Use when the user wants product-strategy guidance on prioritisation, roadmap, or market positioning."*
- **Rationale**: capability blurb → user-intent trigger.

#### `staff-engineer` True positive
- **Original**: *"Enterprise-grade software development with strategic system design, full-stack implementation, scalability planning, and production-ready solutions across the entire development lifecycle"*
- **Proposed**: *"Use when the user wants staff-level engineering guidance on system design, implementation, or scalability for production code."*
- **Rationale**: capability blurb → user-intent trigger.

#### `system-architect` True positive
- **Original**: *"Specializes in designing scalable system architectures, refactoring problematic codebases, and transforming legacy systems into maintainable solutions with future-proof designs"*
- **Proposed**: *"Use when the user wants to design a scalable architecture, refactor a problematic codebase, or modernise a legacy system."*
- **Rationale**: capability blurb → user-intent trigger.

#### `shadcn-component-researcher` True positive
- **Original**: *"Specialized shadcn/ui helper for React component development with TypeScript, Tailwind CSS, and modern UI patterns"*
- **Proposed**: *"Use when the user wants to research the right shadcn/ui component for a React/TypeScript UI need."*
- **Rationale**: capability blurb → user-intent trigger. Note: this generic blurb is **identical** across four shadcn-* skills, so the LLM has no way to pick between them. Per-skill differentiation is required.

#### `shadcn-implementation-builder` True positive
- **Original**: *"Specialized shadcn/ui helper for React component development with TypeScript, Tailwind CSS, and modern UI patterns"* (identical blurb)
- **Proposed**: *"Use when the user wants to assemble a working React/TypeScript UI by composing shadcn/ui components."*
- **Rationale**: differentiates from researcher / quick-helper / requirements-analyzer.

#### `shadcn-quick-helper` True positive
- **Original**: *"Specialized shadcn/ui helper for React component development with TypeScript, Tailwind CSS, and modern UI patterns"* (identical blurb)
- **Proposed**: *"Use when the user has a small, targeted shadcn/ui question (a snippet, a prop, a quick fix)."*
- **Rationale**: differentiates as low-ceremony helper.

#### `shadcn-requirements-analyzer` True positive
- **Original**: *"Specialized shadcn/ui helper for React component development with TypeScript, Tailwind CSS, and modern UI patterns"* (identical blurb)
- **Proposed**: *"Use when the user wants requirements for a shadcn/ui feature analysed before implementation begins."*
- **Rationale**: differentiates as front-of-pipeline analyser.

#### `fresh` True positive
- **Original**: *"Project initialization and deployment automation"*
- **Proposed**: *"Use when the user wants to run the full project initialization and deployment protocol from a clean slate."*
- **Rationale**: noun-phrase blurb (4 words) → user-intent trigger.

#### `plan` True positive
- **Original**: *"Structured workflow planning for complex tasks"*
- **Proposed**: *"Use when the user wants a complex task broken down into a structured plan before execution."*
- **Rationale**: noun-phrase blurb → user-intent trigger.

#### `prompt` True positive
- **Original**: *"Analyze and optimize prompts using modern AI techniques"*
- **Proposed**: *"Use when the user wants an existing prompt analysed and optimised for clarity, safety, and effectiveness."*
- **Rationale**: capability blurb → user-intent trigger.

#### `push` Edge case
- **Original**: *"Stage all changes, generate commit message, commit, and push to remote."*
- **Lint pattern**: missing `Use when`.
- **Ambiguity**: this is a slash-command-style skill (`/push`). Description is short and operational; the trigger is the literal slash-command invocation rather than natural language. Master could either accept (slash-command skills naturally trigger by command, not description) or rewrite to *"Use when the user wants all local changes staged, committed with an auto-message, and pushed to remote."* Flag.

#### `start-palafito` Edge case
- **Original**: *"Arranca Docker Desktop si no está corriendo y despliega el stack de Paperclip palafito-prod."*
- **Lint pattern**: missing `Use when`. (Spanish.)
- **Ambiguity**: same situation as `push` — slash-command-style operational skill in Spanish. Could be left as-is or rewritten to *"Úsalo cuando el usuario quiere arrancar el stack palafito-prod y, si hace falta, Docker Desktop."* Flag for Master alongside the `nuevo-lote` Spanish question.

## Edge cases — for Master

| Skill | Original | Why it's an edge case |
|---|---|---|
| `bmad-create-prd` | "Create a PRD from scratch. Use when the user says 'lets create a product requirements document' …" | Trigger phrase echoes the lead summary. Acceptable but the brief's example is stronger. |
| `bmad-index-docs` | "Generates or updates an index.md … Use if user requests …" | "Use if user requests" is semantically equivalent to "Use when the user wants" — depends on whether lint accepts the variant. |
| `bmad-shard-doc` | "Splits large markdown documents … Use if the user says perform shard document" | Trigger phrase reads awkwardly in English. Could tighten. |
| `push` | "Stage all changes, generate commit message …" | Slash-command-style skill — invocation trigger is the slash, not natural language. |
| `start-palafito` | "Arranca Docker Desktop … palafito-prod." | Slash-command-style + Spanish — same situation. |

## Open questions

1. **Lint parser bug.** Should `check_skill_descriptions.py` v0.8.0 use `yaml.safe_load` for frontmatter so folded-scalar (`description: >`) descriptions are read correctly? This eliminates 47 of 88 false positives in one change.
2. **`Use when` substring vs. semantic equivalents.** Should the lint accept `Use if`, `Use whenever`, `When the user`, `Run when`, `Use after`, `Run FIRST when`, `Úsalo cuando` (Spanish), `Use this skill whenever`? All occur in real CSO-compliant descriptions today.
3. **Quoted user phrases.** Should the lint ignore `through` / `scaffold` matches that fall **inside** quotation marks (i.e. user trigger phrases the skill is supposed to listen for)? `bmad-cis-storytelling` and `bmad-checkpoint-preview` are penalised today for `through` inside the user's quoted trigger.
4. **Verb-led title sentence + `Use when` clause.** The brief explicitly states this is CSO-compliant (cf. `bmad-agent-builder` example). Should the lint be tuned to recognise the pattern `^<verb-summary>\. Use when …$` as compliant? Today every such description fires a false positive.
5. **Spanish descriptions.** `nuevo-lote` and `start-palafito` are in Spanish (project-appropriate — Palafito is a Spanish-language project). Is the project standard bilingual descriptions, or should every description be English regardless of project domain? This affects the rewrite for `nuevo-lote`.
6. **SKILL.md template duplication.** The four `shadcn-*` skills carry identical descriptions. Either the template that generated them is wrong (per-skill description never customised) or the team treats them as a swarm where any one is fine to invoke. Master should confirm before applying the proposed differentiated rewrites.
7. **Slash-command-only skills.** `push`, `start-palafito`, `start`, `fresh`, `plan`, `prompt` are typically invoked by literal slash command. Should the CSO rule require natural-language triggers for them, or accept that the slash-command itself is the trigger?
