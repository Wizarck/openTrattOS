# Tasks: m2-labels-print-config-ui

> Wave 1.15. 6 stages, single PR. Each stage is a single commit; all green locally before pushing.

## Stage 1 — `<RoleGuard>` in packages/ui-kit

- [ ] `packages/ui-kit/src/components/RoleGuard/RoleGuard.types.ts` — `UserRole = 'OWNER' | 'MANAGER' | 'STAFF'` + `RoleGuardProps`.
- [ ] `packages/ui-kit/src/components/RoleGuard/RoleGuard.tsx` — pure component, ~30 LOC. Docstring documents "UX-only; the server `@Roles` decorator is the authoritative gate".
- [ ] `packages/ui-kit/src/components/RoleGuard/RoleGuard.test.tsx` — 3 vitest tests.
- [ ] `packages/ui-kit/src/components/RoleGuard/RoleGuard.stories.tsx` — 2 stories.
- [ ] `packages/ui-kit/src/components/RoleGuard/index.ts` — barrel.
- [ ] `packages/ui-kit/src/index.ts` — append `RoleGuard` + `UserRole` exports.

## Stage 2 — `<LabelFieldsForm>` in packages/ui-kit

- [ ] `packages/ui-kit/src/components/LabelFieldsForm/LabelFieldsForm.types.ts` — `LabelFieldsFormValues`, `LabelFieldsFormProps`, `LabelFieldsFormErrors`, page-size + adapter-id literals.
- [ ] `packages/ui-kit/src/components/LabelFieldsForm/LabelFieldsForm.tsx` — controlled form. ~250 LOC including:
  - Six section blocks (`<fieldset>`s with `<legend>`).
  - Local `useState<LabelFieldsFormValues>` initialised from `initialValues`.
  - Inline errors below each field from the `errors` prop.
  - "Adapter type" select with single `IPP` option; nested IPP config sub-form.
  - Save button at the bottom; disabled when `submitting` or `disabled`.
  - Submit handler: calls `onSubmit(currentValues)`.
- [ ] `packages/ui-kit/src/components/LabelFieldsForm/LabelFieldsForm.test.tsx` — 6 vitest tests.
- [ ] `packages/ui-kit/src/components/LabelFieldsForm/LabelFieldsForm.stories.tsx` — 4 stories (Empty, Filled, Submitting, WithErrors).
- [ ] `packages/ui-kit/src/components/LabelFieldsForm/index.ts` — barrel.
- [ ] `packages/ui-kit/src/index.ts` — append `LabelFieldsForm` + types exports.

## Stage 3 — apps/web hooks + API helpers

- [ ] `apps/web/src/api/orgLabelFields.ts` — typed fetch helpers:
  - `getOrgLabelFields(orgId): Promise<LabelFieldsFormValues>`
  - `putOrgLabelFields(orgId, values): Promise<LabelFieldsFormValues>`
- [ ] `apps/web/src/hooks/useOrgLabelFields.ts` — `useOrgLabelFieldsQuery(orgId)` + `useOrgLabelFieldsMutation(orgId)` with TanStack Query. On mutation success, invalidate the query.

## Stage 4 — `OwnerOrgSettingsScreen` + nav + route

- [ ] `apps/web/src/lib/currentUser.ts` (NEW or extend existing) — `useCurrentRole(): UserRole | null` reading `import.meta.env.VITE_DEMO_USER_ROLE` (defaulting to `'OWNER'` for demo).
- [ ] `apps/web/src/screens/OwnerOrgSettingsScreen.tsx`:
  - `<RoleGuard>` wrapper with `<AccessDenied />` fallback (small inline component).
  - Inner component mounts the query + mutation hooks.
  - Maps `mutation.error?.body?.errors` → form `errors` prop.
  - Renders inline "Configuración guardada" success message for ~3s after a successful save (local state, `useEffect` timer).
- [ ] `apps/web/src/screens/OwnerOrgSettingsScreen.test.tsx` — 3 vitest tests (Owner renders form; Manager sees fallback + zero fetches; submit triggers mutation).
- [ ] `apps/web/src/main.tsx` — register `/owner-settings` route.
- [ ] `apps/web/src/App.tsx` — add nav `<Link to="/owner-settings">` wrapped in `<RoleGuard role="OWNER">` so non-Owners don't see it.
- [ ] `apps/web/.env.example` — document `VITE_DEMO_USER_ROLE` default.

## Stage 5 — Cross-cutting + verification

- [ ] grep `RoleGuard` to confirm only used in expected places.
- [ ] `npm run build --workspace=@opentrattos/ui-kit` clean.
- [ ] `npm run build --workspace=apps/web` clean.
- [ ] `npm test --workspace=@opentrattos/ui-kit` green (current 166 → ≥175).
- [ ] `npm test --workspace=apps/web` green.
- [ ] `npm run lint` passes across workspaces.
- [ ] `npm run storybook:build --workspace=@opentrattos/ui-kit` clean.

## Stage 6 — PR + Gate F

- [ ] Single PR `proposal(m2-labels-print-config-ui): Owner UI for label-fields config (Wave 1.15)`.
- [ ] Body lists the 6 stages + the new screen + the new ui-kit components.
- [ ] CI green (build / lint / test / Storybook / Gitleaks / CodeRabbit).
- [ ] Squash-merge after CR clean.
- [ ] `chore(m2-labels-print-config-ui): archive + retro (Gate F closed; Wave 1.15)` follow-up.
- [ ] Update `project_m1_state.md` memory + MEMORY.md index.
