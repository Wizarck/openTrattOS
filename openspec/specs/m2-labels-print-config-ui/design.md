# Design: m2-labels-print-config-ui

> Wave 1.15. Companion: `proposal.md`.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ apps/web/                                                │
│                                                          │
│  /owner-settings                                         │
│      │                                                   │
│      ▼                                                   │
│  OwnerOrgSettingsScreen                                  │
│      │                                                   │
│      ├── <RoleGuard role="OWNER" currentRole={…}>        │
│      │      │                                            │
│      │      ▼                                            │
│      │  <LabelFieldsForm                                 │
│      │       initialValues={query.data}                  │
│      │       onSubmit={mutation.mutate}                  │
│      │       submitting={mutation.isPending}             │
│      │       errors={parsedApiErrors} />                 │
│      │                                                   │
│      └── (non-Owner) <AccessDenied />                    │
│                                                          │
│  Hooks:                                                  │
│    useOrgLabelFieldsQuery(orgId) ─→ GET /:id/label-fields│
│    useOrgLabelFieldsMutation(orgId) ─→ PUT + invalidate  │
└──────────────────────────────────────────────────────────┘
              │
              │ HTTP (browser session, OWNER JWT)
              ▼
┌──────────────────────────────────────────────────────────┐
│ apps/api/                                                │
│                                                          │
│   GET /organizations/:id/label-fields  (Owner|Manager)   │
│   PUT /organizations/:id/label-fields  (Owner only,      │
│                                         @AuditAggregate) │
└──────────────────────────────────────────────────────────┘
```

The slice is **frontend-only**. The backend endpoints are unchanged and were shipped in Wave 1.6 (`m2-labels-rendering`).

## Component contracts

### `<RoleGuard>` (NEW, packages/ui-kit)

```ts
type UserRole = 'OWNER' | 'MANAGER' | 'STAFF';

interface RoleGuardProps {
  /** Role(s) allowed to see the children. Pass an array for any-of semantics. */
  role: UserRole | UserRole[];
  /** The current authenticated user's role; null when no user / pre-auth. */
  currentRole: UserRole | null;
  /** Rendered when role doesn't match. Defaults to null (silent hide). */
  fallback?: ReactNode;
  children: ReactNode;
}
```

**Rules:**

1. `currentRole === null` → renders `fallback`. No "skip the check" semantics.
2. `Array.isArray(role)` → match if `role.includes(currentRole)`.
3. `role: UserRole` (string) → match if `role === currentRole`.
4. No DOM / hooks beyond the basic conditional render. Pure component.

**What this is NOT:**

- NOT a security primitive. The server `@Roles(...)` decorator stays the authoritative gate. Documented in the component's docstring.
- NOT route-level. React Router-level guards are out of scope; consumers compose `<RoleGuard>` inside their screen body.
- NOT a hook. We may add `useCurrentRole()` later if a session context lands; today the role is passed explicitly.

### `<LabelFieldsForm>` (NEW, packages/ui-kit)

```ts
interface LabelFieldsFormValues {
  businessName?: string;
  contactInfo?: { email?: string; phone?: string };
  postalAddress?: { street: string; city: string; postalCode: string; country: string };
  brandMarkUrl?: string;
  pageSize?: 'a4' | 'thermal-4x6' | 'thermal-50x80';
  printAdapter?: { id: string; config: Record<string, unknown> };
}

interface LabelFieldsFormProps {
  initialValues?: LabelFieldsFormValues;
  onSubmit: (values: LabelFieldsFormValues) => void;
  submitting?: boolean;
  /** Field-keyed error messages from the server (or zod). */
  errors?: Partial<Record<keyof LabelFieldsFormValues | string, string>>;
  /** Render-only mode (no editing, no submit). */
  disabled?: boolean;
}
```

**Layout (top-down):**

1. **Business name** — single text input, `MaxLength(200)`.
2. **Contact info** — two inputs side-by-side: email (`IsEmail` optional), phone (`MaxLength(40)` optional).
3. **Postal address** — four inputs in a 2x2 grid: street, city, postalCode, country. All required when ANY of the four is set (group-level invariant).
4. **Brand mark URL** — single text input, `IsUrl` optional. A small thumbnail preview renders below the input when the URL is set + reachable.
5. **Page size** — radio group with three options. Default `a4` if no value.
6. **Printer adapter** — select with one option (`IPP`); when selected, an inline sub-form renders the IPP config fields:
   - `url` — required, IsUrl
   - `queue` — optional, MaxLength(100)
   - `apiKey` — optional, MaxLength(200), `type="password"` masked input
   - `timeoutMs` — optional number, min 100, max 60000

Submit button at the bottom. When `submitting=true`, button label becomes "Guardando…" and the button is disabled.

**Validation:**

- Client-side zod schema mirrors the apps/api `class-validator` constraints. Errors render inline below their field.
- The form does NOT call the API itself — `onSubmit` is the consumer's mutation hook. Server-side errors arrive via the `errors` prop and surface inline next to the offending field.

**Why this composition over a generic JSON-schema-driven form:**

- The 6 sections have distinct UX needs (radio for enum, masked input for apiKey, structured 2x2 for address). A schema-driven form would render generic inputs.
- The number of sections is bounded (1–6 with one polymorphic adapter sub-form). Hand-rolling matches the repo's "presentational primitives in ui-kit; consumer composes" pattern (per `m2-ui-foundation` ADR-020).
- Adding a `m2-labels-print-adapter-registry-endpoint` slice later can refactor the printer-adapter sub-form to be schema-driven from the registry's exposed JSON schema; that is a follow-up, not a precondition.

### `useOrgLabelFields` (NEW, apps/web)

```ts
function useOrgLabelFieldsQuery(orgId: string): UseQueryResult<LabelFieldsFormValues>;
function useOrgLabelFieldsMutation(orgId: string): UseMutationResult<LabelFieldsFormValues, ApiError, LabelFieldsFormValues>;
```

- `useOrgLabelFieldsQuery` — `staleTime: 5 * 60 * 1000` (5 min) — config rarely changes intra-session.
- `useOrgLabelFieldsMutation` — on success, invalidates the query for `orgId`. On `422` with field-shaped errors, surfaces them via the mutation's `error` for the screen to map into form `errors`.

### `OwnerOrgSettingsScreen` (NEW, apps/web)

```tsx
function OwnerOrgSettingsScreen() {
  const orgId = useOrgIdFromSession();
  const currentRole = useCurrentRole();

  return (
    <RoleGuard
      role="OWNER"
      currentRole={currentRole}
      fallback={<AccessDenied />}
    >
      <Inner orgId={orgId} />
    </RoleGuard>
  );
}

function Inner({ orgId }: { orgId: string }) {
  const query = useOrgLabelFieldsQuery(orgId);
  const mutation = useOrgLabelFieldsMutation(orgId);
  const errors = useFieldErrors(mutation.error);
  // ...renders <LabelFieldsForm ...>
}
```

The split into `Inner` is so the query+mutation hooks don't mount until `<RoleGuard>` passes — a non-Owner visiting `/owner-settings` triggers zero network traffic.

## Sub-decisions

### SD1 — `currentRole` source: env var for demo, JWT claim later

Today `apps/web` is a demo without a real auth session. Adding `VITE_DEMO_USER_ROLE=OWNER` env var lets us showcase the screen in dev. When real auth lands (M3), `useCurrentRole()` switches to read from the session token's `role` claim — the screen body is unchanged.

### SD2 — toast library: keep none for now

Wave 1.6 / 1.13 screens do not use a toast library; they render success state inline. Adding one (Sonner / react-hot-toast) would be a new dep. Match the existing pattern: render a transient "Configuración guardada" inline below the Save button for ~3 seconds via local state. Filed `m2-toast-system` as backlog.

### SD3 — form library: react-hook-form vs controlled local state

The repo doesn't use react-hook-form anywhere. The form is small (≤8 inputs) and the pattern matches `YieldEditor` / `WasteFactorEditor` (controlled local state with `useState`). Stick with that. If the form grows past 12 inputs, introducing react-hook-form is a separate refactor (filed `m2-form-library`).

### SD4 — server-error → form-error mapping

apps/api `class-validator` returns a 422 with `errors: { fieldName: 'message' }` shape on validation failure. The mutation's `error.body.errors` maps directly into the form's `errors` prop. For nested fields (`postalAddress.city`), use dotted keys (`postalAddress.city`).

### SD5 — `disabled` flag scope

The `LabelFieldsForm.disabled` prop is for "render-only" cases (e.g. a future "view as Manager" mode). It hides the Save button and disables every input. Today nothing consumes it; included so the component surface is symmetric and Storybook can show the disabled state.

## Test strategy

**ui-kit (`packages/ui-kit/`):**

- `RoleGuard.test.tsx` — 3 tests:
  1. Matching role renders children (string + array forms).
  2. Non-matching role renders fallback (default null).
  3. `currentRole=null` renders fallback regardless of `role`.
- `LabelFieldsForm.test.tsx` — 6 tests:
  1. Empty initialValues → all inputs render in their unset state; Save calls `onSubmit({})`.
  2. With `initialValues={existingDto}` → inputs show the values; Save calls `onSubmit` with the same values.
  3. Editing Business name updates the input value.
  4. PageSize radio change updates state.
  5. `errors={{ brandMarkUrl: 'must be a URL' }}` renders the inline error.
  6. `submitting=true` disables Save + changes label.

**apps/web:**

- `OwnerOrgSettingsScreen.test.tsx` — 3 tests:
  1. Owner sees `<LabelFieldsForm>` rendered with fetched values.
  2. Manager sees the access-denied fallback; no fetch fires (mock the fetch and assert `0` calls).
  3. Submit triggers `mutate(values)` with the form's current values.

**Storybook:**

- `RoleGuard.stories.tsx` — Owner-allowed (children visible); Manager-blocked (fallback visible).
- `LabelFieldsForm.stories.tsx` — Empty / Filled / Submitting / WithErrors.

## Out-of-scope follow-ups

Listed in proposal.md `Filed follow-ups for adjacent capabilities`. Notable: `m2-labels-print-test-endpoint`, `m2-labels-print-adapter-registry-endpoint`, `m2-labels-brand-mark-upload`, `m2-labels-multi-printer`, `m2-codegen-api-types`.
