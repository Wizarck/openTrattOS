# openTrattOS — Runbook

> **What this is.** Thin project-specific guide. The universal runbook lives at `.ai-playbook/` (T11 will finalize the BMAD+OpenSpec reference). Add only what is **openTrattOS-specific** here.

## Flow (BMAD + OpenSpec)

1. **Discovery (BMAD).** PRD → personas/JTBD → architecture ADRs → data model. Human approves at each gate.
2. **Slicing.** Break the PRD into OpenSpec-shaped changes (one bounded context or feature per change).
3. **Per change (OpenSpec).**
   - `/opsx:propose` → `proposal.md`.
   - `/opsx:explore` for open questions.
   - `specs || design` → concurrent artifacts.
   - `tasks.md` (TDD-selective per layer — see `AGENTS.md` §4).
   - `openspec apply` → implementation.
   - `openspec archive` → `openspec/specs/*.md` updated (never hand-edited).
4. **Retros.** Post-archive, weekly, monthly. Cadence in `.ai-playbook/specs/retrospective-cadence.md` (populated in T14i).

## Self-validation gates (silent, before QA)

Before handing any artifact to a review subagent:

1. **Scope.** Artifact does only what the proposal approved.
2. **Anti-duplication.** Check `openspec/changes/*/`, `openspec/specs/*`, and `docs/` for the same concern; don't fork it.
3. **Traceability.** Every decision cites its source (`ADR-00X`, `docs/prd-*`, a Jira ticket — never a summary).
4. **TDD compliance.** Layer mandate met (domain TDD, application recommended, infra integration, interface E2E).
5. **Naming.** Canonical naming per `.ai-playbook/specs/taxonomy.md` (T03c).

If any gate fails, fix before invoking QA — don't let QA surface S1/S2 items that self-validation could have caught.

## QA handoff

Parallel review discipline per `.ai-playbook/specs/parallel-review.md`:

- `bmad-code-review` — 3 orthogonal layers in one skill.
- `bmad-review-edge-case-hunter` — walks every branch, reports only unhandled.
- `bmad-review-adversarial-general` — cynical adversarial critique.

Verdicts: `✅ APPROVED | ⚠️ ISSUES FOUND (iter N) | ❓ CLARIFICATION NEEDED` with severity S1–S4. S1/S2 block. Max 2 rework cycles; if the same issue recurs a third time, escalate as SYSTEMIC.

## Lifecycle states

`proposal-drafted → proposal-approved → specs/design drafted → approved → tasks-drafted → approved → applying → applied → archived`

Block state: `blocked-by-spec` when QA emits `❓ CLARIFICATION` or `openspec validate` fails. **Never** implement despite a block.

## openTrattOS-specific deviations

- **TDD selectivity.** Per layer, per ADR. See `AGENTS.md` §4.
- **Dual repo.** Community PRs via GitHub Issues; enterprise work never lands here.
- **Conventional commits.** Enforced — CI gate (T22) verifies.
