# Tasks: m2-mcp-bench-ci

> Wave 1.16. 4 stages, single PR.

## Stage 1 — `regression-check.ts` script + tests

- [ ] `tools/mcp-bench/scripts/regression-check.ts` (NEW) — pure parser + comparison; argv `<new> <baseline> <threshold>`; exit 0/1/2.
- [ ] `tools/mcp-bench/scripts/regression-check.test.ts` (NEW) — 7 vitest tests per design.md §Test strategy.
- [ ] `tools/mcp-bench/package.json` — add `"regression-check": "tsx scripts/regression-check.ts"` to scripts.
- [ ] `tools/mcp-bench/tsconfig.json` — ensure `scripts/` is in `include` (or add `scripts/tsconfig.json`).
- [ ] Lint glob in package.json updated if needed: `eslint "src/**/*.ts" "scripts/**/*.ts"`.

## Stage 2 — `.github/workflows/mcp-bench.yml`

- [ ] `.github/workflows/mcp-bench.yml` (NEW) per design.md §Workflow file shape.
- [ ] Two jobs: `lint-test-build` (PR + manual) + `bench` (workflow_dispatch only).
- [ ] Workflow inputs: `client` (choice: hermes), `duration` (string), `regression_threshold_pct` (string), `commit_report` (boolean).
- [ ] Permissions: `contents: write` at workflow level.
- [ ] Concurrency: `mcp-bench-${{ github.ref }}` cancel-in-progress.

## Stage 3 — README + manual smoke

- [ ] `tools/mcp-bench/README.md` — append "CI" section pointing at the workflow + manual invocation recipe (`gh workflow run mcp-bench.yml ...`).
- [ ] Validate locally: run `tsx scripts/regression-check.ts` against the two committed synthetic baselines (both should exit 0 via SD1 synthetic-skip).

## Stage 4 — Verification + PR + Gate F

- [ ] `npm test` in `tools/mcp-bench/` green (13 → 20 tests; +7).
- [ ] `npm run lint` clean.
- [ ] `npm run build` clean.
- [ ] `actionlint` (if available) on the workflow file. Otherwise visual review.
- [ ] PR opened. CI runs the workflow against itself (since the PR touches `tools/mcp-bench/**`).
- [ ] Squash-merge once green.
- [ ] Retro at `retros/m2-mcp-bench-ci.md`.
- [ ] Update memory.
