# Spec: m2-labels-print-config-ui

> Wave 1.15. Acceptance scenarios for the Owner label-fields config UI.

## Scenario: WHEN an Owner navigates to /owner-settings, THEN the existing label-fields config loads into a form

```
GIVEN  An authenticated user with role 'OWNER' for organization X
       AND organizations.label_fields contains: { businessName: 'Trattoria Acme', pageSize: 'a4' }
WHEN   The user navigates to /owner-settings
THEN   apps/web fires GET /organizations/X/label-fields
       AND The screen renders <LabelFieldsForm initialValues={...}>
       AND The "Business name" input shows 'Trattoria Acme'
       AND The "Page size" radio shows 'a4' selected
       AND All other sections render their empty / unset state.
```

## Scenario: WHEN a non-Owner user navigates to /owner-settings, THEN access is denied client-side

```
GIVEN  An authenticated user with role 'MANAGER' OR 'STAFF'
WHEN   The user navigates to /owner-settings
THEN   <RoleGuard role="OWNER"> short-circuits before the query mounts
       AND No GET /organizations/:id/label-fields request fires
       AND The screen renders an access-denied fallback message.
       AND The server-side @Roles('OWNER') guard is independently still in place
            (defence in depth; not exercised on this client path).
```

## Scenario: WHEN an Owner edits the form and saves, THEN PUT /organizations/:id/label-fields is called and the data refetches

```
GIVEN  Owner is on /owner-settings with the form rendered
WHEN   Owner edits "Business name" to 'New Name'
       AND clicks Save
THEN   apps/web fires PUT /organizations/X/label-fields with the changed shape
       AND On 200 OK, the TanStack query is invalidated
       AND The form re-fetches and shows 'New Name' (now persistent)
       AND A success toast renders ('Configuración guardada').
```

## Scenario: WHEN PUT returns a 422 with field errors, THEN the form surfaces inline errors

```
GIVEN  Owner submits the form with brandMarkUrl='not-a-url'
WHEN   apps/api responds 422 with { errors: { brandMarkUrl: 'must be a URL' } }
       OR client-side zod validation catches it before submission
THEN   The form submission is blocked
       AND The brandMarkUrl input shows the inline error 'must be a URL'
       AND The Save button re-enables (no longer "submitting").
```

## Scenario: WHEN the Owner picks a different page size, THEN the radio updates the form state

```
GIVEN  Owner is on /owner-settings with pageSize='a4' selected
WHEN   Owner clicks the 'thermal-4x6' radio
THEN   The radio reflects 'thermal-4x6' selected
       AND saving submits printAdapter / pageSize change to PUT.
```

## Scenario: WHEN the printAdapter section is shown, THEN it renders IPP-specific config fields hard-coded

```
GIVEN  The form renders the printAdapter section
WHEN   The "Adapter type" select has 'ipp' as the only option (selected)
THEN   The IPP-specific config inputs render: url (required), queue (optional),
       apiKey (optional, masked), timeoutMs (optional, number, min 100, max 60000)
       AND No other adapter id is selectable (until m2-labels-print-adapter-registry-endpoint ships).
```

## Scenario: WHEN <RoleGuard> receives an array of allowed roles, THEN any role in the array passes

```
GIVEN  <RoleGuard role={['OWNER', 'MANAGER']} currentRole='MANAGER'>
WHEN   The component renders
THEN   The children render
       AND No fallback shows.

WHEN   currentRole is changed to 'STAFF'
THEN   The fallback renders (default: null)
       AND The children unmount.
```

## Scenario: WHEN the apps/web nav renders for a non-Owner, THEN the Owner settings link is hidden

```
GIVEN  Authenticated user with role 'STAFF'
WHEN   apps/web App.tsx header renders
THEN   The nav does NOT include the "Configuración" link to /owner-settings
       AND If the user types /owner-settings into the URL bar directly,
            <RoleGuard> + the server 403 each independently block them.
```

## Scenario: WHEN the screen is rendered without a current user, THEN it shows a sign-in prompt (no fetch)

```
GIVEN  No authenticated user (session expired / direct URL access pre-login)
WHEN   /owner-settings is visited
THEN   The screen short-circuits (no role to guard against)
       AND Renders a "please sign in" message
       AND No GET request fires.
```

## Scenario: WHEN the form is submitting, THEN the Save button is disabled and labelled "Guardando…"

```
GIVEN  The form is rendered
WHEN   Save is clicked and mutation.isPending = true
THEN   The Save button becomes disabled
       AND Its label changes from 'Guardar' → 'Guardando…'
       AND Inputs remain editable but cannot trigger another submit.

WHEN   The mutation resolves (success or error)
THEN   The button re-enables and the label reverts.
```
