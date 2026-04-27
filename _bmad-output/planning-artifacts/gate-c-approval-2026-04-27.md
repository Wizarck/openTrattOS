---
title: Gate C — Slicing Approval Record
date: 2026-04-27
approver: Master (Architect/PM role)
module: M2 — Recipes / Escandallo / Nutritional Intelligence / Auto-Labels
prereq_gates:
  - Gate A (PRD) — APPROVED 2026-04-27
  - Gate B (Architecture + UX coherence) — APPROVED 2026-04-27
runbook: .ai-playbook/specs/runbook-bmad-openspec.md §2.4 + §5
---

# Gate C — M2 Slicing Approval

PRD-M2 (831 lines, 48 FRs, 5 user journeys) sliced into **11 OpenSpec changes** following the runbook heuristics (1 bounded context per change, ≤10 acceptance scenarios, write_paths bounded, name ≤6 words).

## Approved change list

| # | Change ID | Bounded context | FRs | Journeys | Components | Depends on |
|---|---|---|---|---|---|---|
| 1 | `m2-data-model` | shared kernel | foundation | — | — | — |
| 2 | `m2-recipes-core` | Recipes | FR1-8 | J1, J4 | RecipePicker | #1 |
| 3 | `m2-cost-rollup-and-audit` | Recipes | FR10-15 | J1, J2 | CostDeltaTable, MarginPanel | #1, #2 |
| 4 | `m2-off-mirror` | Nutrition catalogue | FR17-19 | (infra) | — | — |
| 5 | `m2-ingredients-extension` | Ingredients | FR16, FR20, FR26 | J1 | IngredientPicker, SourceOverridePicker, MacroPanel | #1, #4 |
| 6 | `m2-ai-yield-suggestions` | Recipes | FR21-25 | J1 | YieldEditor, WasteFactorEditor | #1, #2 |
| 7 | `m2-allergens-article-21` | Ingredients | FR27, FR28 | J1 | AllergenBadge, DietFlagsPanel | #1, #5 |
| 8 | `m2-menus-margins` | Menus | FR29-32 | J1 | MarginPanel | #1, #2 |
| 9 | `m2-owner-dashboard` | Menus | FR33, FR38, FR39, FR46 | J3 | MenuItemRanker | #8 |
| 10 | `m2-labels-rendering` | Labels | FR34-36 | J1 | LabelPreview | #5, #7 |
| 11 | `m2-mcp-server` | MCP | FR41 (M2 part) | (Agent-Ready) | AgentChatWidget | #2 |

## Parallel-track structure

```
Track A:  #1 → #2 → ┬→ #3
                    ├→ #6
                    ├→ #8 → #9
                    └→ #11
Track B:  #4 → #5 → ┬→ #7
                    └→ #10  (also depends on #7)
```

`#1 m2-data-model` is the absolute blocker (foundation). `#4 m2-off-mirror` is independent infra and can start in parallel. After `#2` and `#5` both land, six changes can run in parallel (#3, #6, #7, #8, #10, #11). `#9` waits on `#8`. `#10` waits on both `#5` and `#7`.

## Volume estimate

11 changes × ~5–10 acceptance scenarios each ≈ 75–110 scenarios total in M2. Equivalent to ~6–10 sprints of implementation work depending on cadence and team size.

## Verdict

`✅ APPROVED` by Master on 2026-04-27. Cleared to start `/opsx:propose` per slice (Phase 3 of the BMAD+OpenSpec runbook).

## Next gate

**Gate D — Per-artefact review** (post-`/opsx:propose`, before `/opsx:apply`). Per change: spec + design + tasks reviewed for PRD-fit, anti-duplication, and worker readiness.
