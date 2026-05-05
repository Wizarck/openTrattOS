// m2-mcp-server / ADR-013 lint-regression fixture.
//
// This file MUST trigger the `no-restricted-imports` rule registered in
// `apps/api/eslint.config.mjs`. It is intentionally excluded from:
//   - the default lint glob (`src/**/*.ts`) — so `npm run lint
//     --workspace=apps/api` stays green during CI
//   - `tsconfig.json` compilation — so `nest build` does not fail on the
//     missing `@modelcontextprotocol/sdk` module (the package is NEVER
//     installed in `apps/api/`; that is the whole point of ADR-013)
//   - jest's `testRegex` — the file ends in `.fixture.ts`, not `.spec.ts`
//
// The lint regression is exercised programmatically by
// `apps/api/src/shared/middleware/agent-audit.middleware.spec.ts`, which
// invokes the ESLint Node API against this file and asserts the rule fires.
//
// DO NOT delete or remove the import below; doing so silently disables the
// regression check. If you need to update the rule, also update both the
// rule definition and this fixture in the same PR.

import * as mcp from '@modelcontextprotocol/sdk';

export const __FIXTURE_FORCES_LINT_RULE__ = mcp;
