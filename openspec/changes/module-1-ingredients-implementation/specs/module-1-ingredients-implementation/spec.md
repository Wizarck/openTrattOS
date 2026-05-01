## ADDED Requirements

### Requirement: Multi-tenant organization with immutable currency

The system SHALL provide an `Organization` entity carrying `name`, `currencyCode` (ISO 4217), `defaultLocale` (`es` | `en`), `timezone`, and audit fields. `currencyCode` is immutable after creation per ADR-007.

#### Scenario: Owner creates organization with EUR
- **WHEN** an Owner POSTs to `/organizations` with `{ name: "Palafito", currencyCode: "EUR", defaultLocale: "es" }`
- **THEN** the response is 201 with the created organization; subsequent reads return `currencyCode: "EUR"`

#### Scenario: Currency change attempt is rejected
- **WHEN** an Owner attempts to PATCH `/organizations/:id` with `{ currencyCode: "USD" }`
- **THEN** the system returns 400 with `{ code: "CURRENCY_IMMUTABLE" }`; the existing currency is preserved

#### Scenario: Invalid ISO 4217 code rejected
- **WHEN** a request supplies `currencyCode: "EURO"` or `"E"`
- **THEN** the system returns 400 with `{ code: "CURRENCY_INVALID_ISO_4217" }`; no organization persists

#### Scenario: Multi-tenant isolation enforced
- **WHEN** a User belonging to Organization A queries `/ingredients`
- **THEN** the response includes only Ingredients with `organizationId = A`; no rows from any other Organization leak

### Requirement: Locations with type enum

The system SHALL provide a `Location` entity belonging to an Organization, with `name`, `address`, `type` enum (`RESTAURANT | BAR | DARK_KITCHEN | CATERING | CENTRAL_PRODUCTION`), `isActive`, and audit fields. Users can be assigned to one or more Locations via the `UserLocation` join entity.

#### Scenario: Owner creates location with valid type
- **WHEN** an Owner POSTs to `/locations` with `{ name: "Sede Centro", address: "Calle Mayor 1", type: "RESTAURANT" }`
- **THEN** the response is 201; the location is scoped to the Owner's Organization

#### Scenario: Invalid location type rejected
- **WHEN** the request supplies `type: "FOODTRUCK"` (not in the enum)
- **THEN** the system returns 400 with `{ code: "LOCATION_TYPE_INVALID", allowed: ["RESTAURANT","BAR","DARK_KITCHEN","CATERING","CENTRAL_PRODUCTION"] }`

#### Scenario: User assigned to multiple locations
- **WHEN** an Owner POSTs to `/users/:userId/locations` with `{ locationIds: ["<L1>","<L2>"] }`
- **THEN** two `UserLocation` rows persist; querying `GET /users/:userId` includes both location refs

#### Scenario: Location soft-delete preserves history
- **WHEN** a Location is soft-deleted via PATCH `isActive=false`
- **THEN** existing `UserLocation` rows remain; default `GET /locations` excludes the row but `?includeInactive=true` shows it

### Requirement: Users with email unique-per-organization

The system SHALL provide a `User` entity with `email`, `passwordHash`, `name`, `role` (OWNER/MANAGER/STAFF), `organizationId`, `isActive`, and audit fields. Email SHALL be unique within an Organization (the same email may exist across different Organizations).

#### Scenario: Owner creates user
- **WHEN** an Owner POSTs to `/users` with `{ name: "Lourdes", email: "lourdes@example.com", role: "MANAGER" }`
- **THEN** the response is 201 with the user under the Owner's Organization; password issuance is handled out-of-band (dev test-token endpoint)

#### Scenario: Duplicate email within org rejected
- **WHEN** an Owner attempts to POST a second user with the same email already registered in the same Organization
- **THEN** the system returns 409 with `{ code: "USER_EMAIL_DUPLICATE_IN_ORG" }`

#### Scenario: Same email allowed across organizations
- **WHEN** two different Organizations each create a user with `email: "shared@example.com"`
- **THEN** both creations succeed; the email is unique-per-org, not globally unique

#### Scenario: Role enum validated
- **WHEN** a request supplies `role: "ADMIN"` (not in the enum)
- **THEN** the system returns 400 with `{ code: "USER_ROLE_INVALID", allowed: ["OWNER","MANAGER","STAFF"] }`

### Requirement: Hierarchical category tree with seed and RESTRICT cascade

The system SHALL provide a `Category` entity with self-referencing `parentId`, `name` (untranslated canonical), `nameEs` + `nameEn` (translated), `sortOrder`, `isDefault` (true if from seed taxonomy), `organizationId`, and audit fields. On `Organization.create`, the system SHALL seed the default taxonomy from PRD-M1 §Appendix A based on `defaultLocale`, marking each seeded row with `isDefault=true`. Category deletion SHALL be `RESTRICT` if children or linked Ingredients exist.

#### Scenario: Seed taxonomy on org creation
- **WHEN** an Organization is created with `defaultLocale: "es"`
- **THEN** the database contains the 30+ seed Category rows under `organizationId`, each with `nameEs` populated and tree relationships intact (Fresh > Verduras > Verduras de Hoja, etc.)

#### Scenario: Category deletion blocked by children
- **WHEN** a Manager attempts to DELETE `/categories/:id` where the Category has child Categories
- **THEN** the system returns 409 with `{ code: "CATEGORY_HAS_CHILDREN", childIds: [...] }`; the row remains

#### Scenario: Category deletion blocked by linked ingredients
- **WHEN** a Manager attempts to DELETE `/categories/:id` where Ingredients reference the Category
- **THEN** the system returns 409 with `{ code: "CATEGORY_HAS_INGREDIENTS", ingredientCount: N }`

#### Scenario: Category tree loaded in single query
- **WHEN** a user requests `GET /categories?tree=true`
- **THEN** the response returns the full tree in a single response (no N+1); load time is <200ms for the seeded taxonomy

#### Scenario: Custom category creation at any depth
- **WHEN** a Manager POSTs to `/categories` with `{ name: "Setas Especiales", nameEs: "Setas Especiales", nameEn: "Specialty Mushrooms", parentId: <fresh-vegetables-id> }`
- **THEN** the row persists under the parent with `isDefault=false`; subsequent tree queries reflect it sorted by `sortOrder`

#### Scenario: Seed rows tagged isDefault
- **WHEN** the seed runs on Organization create
- **THEN** every seeded Category row has `isDefault=true`; user-created categories default to `isDefault=false`

### Requirement: UoM conversion engine — within-family allowed, cross-family rules

The system SHALL provide a UoM conversion engine supporting WEIGHT (kg, g, mg, lb, oz), VOLUME (L, ml, cl, fl oz, gallon), and UNIT (pcs, dozen, box) families. Within-family conversions SHALL be automatic. WEIGHT↔VOLUME requires `densityFactor`. Any↔UNIT cross-family is forbidden.

#### Scenario: Within-family WEIGHT conversion
- **WHEN** the engine converts 1500g to kg
- **THEN** the result is 1.5

#### Scenario: Within-family VOLUME conversion
- **WHEN** the engine converts 250ml to L
- **THEN** the result is 0.25

#### Scenario: Cross-family WEIGHT↔VOLUME with density succeeds
- **WHEN** the engine converts 100g to ml with `densityFactor=1.0` (water)
- **THEN** the result is 100

#### Scenario: Cross-family WEIGHT↔VOLUME without density fails
- **WHEN** the engine converts 100g to ml with `densityFactor=null`
- **THEN** the engine throws `UoMConversionRequiresDensityError`

#### Scenario: Any↔UNIT cross-family forbidden
- **WHEN** the engine converts 1kg to pcs
- **THEN** the engine throws `UoMConversionForbiddenError`; no result returned

#### Scenario: 100% unit-test coverage
- **WHEN** CI runs `npm test apps/api/src/catalog/domain/uom`
- **THEN** coverage report shows 100% statements / branches / functions for the UoM module

### Requirement: Ingredient entity with immutable baseUnitType

The system SHALL provide an `Ingredient` entity per PRD-M1 §4.1 with `name`, auto-generated `internalCode` (editable), `baseUnitType` (immutable after creation), `categoryId`, `densityFactor` (nullable), `notes`, `isActive`, organization scoping, and audit fields.

#### Scenario: Manager creates ingredient
- **WHEN** a Manager POSTs to `/ingredients` with `{ name: "Tomate Cherry", categoryId: <id>, baseUnitType: "WEIGHT" }`
- **THEN** the response is 201 with `internalCode` auto-generated, `isActive: true`, `createdBy` set from JWT

#### Scenario: baseUnitType change rejected
- **WHEN** a Manager attempts to PATCH `/ingredients/:id` with `{ baseUnitType: "VOLUME" }`
- **THEN** the system returns 400 with `{ code: "BASE_UNIT_TYPE_IMMUTABLE" }`; the row is unchanged

#### Scenario: Density factor required for cross-family use
- **WHEN** a downstream consumer requests cross-family conversion on an ingredient with `densityFactor=null`
- **THEN** the conversion fails per the UoM rules; the system returns `{ code: "INGREDIENT_REQUIRES_DENSITY", ingredientId }`

#### Scenario: Cursor-based pagination on list
- **WHEN** a Manager requests `GET /ingredients?limit=25&cursor=<opaque>`
- **THEN** the response returns ≤25 items + `nextCursor` (or null at end); same cursor on retry returns same page

### Requirement: Supplier and SupplierItem with auto-calculated cost-per-base-unit

The system SHALL provide `Supplier` (name, contact info, country, isActive) and `SupplierItem` (linking Supplier × Ingredient with `purchaseUnit`, `purchaseUnitQty`, `purchaseUnitType`, `unitPrice`, auto-computed `costPerBaseUnit`, `isPreferred`).

#### Scenario: Auto-compute costPerBaseUnit
- **WHEN** a Manager creates a SupplierItem with `purchaseUnit="5 kg Box"`, `purchaseUnitQty=5000` (grams), `unitPrice=12.50` on an Ingredient with `baseUnitType=WEIGHT`
- **THEN** the system stores `costPerBaseUnit = 0.0025` (€/g, 4 decimal precision)

#### Scenario: purchaseUnitType must match ingredient family
- **WHEN** a Manager creates a SupplierItem with `purchaseUnitType="VOLUME"` on a `WEIGHT`-base Ingredient (no density)
- **THEN** the system returns 400 with `{ code: "PURCHASE_UNIT_FAMILY_MISMATCH" }`

#### Scenario: Only one preferred supplier item per ingredient
- **WHEN** a Manager flags a SupplierItem as `isPreferred=true` while another already is
- **THEN** the system unsets `isPreferred` on the previous one atomically; queries return exactly one preferred row

#### Scenario: 4-decimal internal precision, 2-decimal display
- **WHEN** the cost calculation yields `0.00251256...`
- **THEN** the database stores `0.0025`; the API response surfaces `costPerBaseUnit: "0.00"` in display contexts and `0.0025` in cost-engine contexts

### Requirement: RBAC OWNER / MANAGER / STAFF enforcement

The system SHALL enforce the RBAC matrix per [personas-jtbd.md](../../../docs/personas-jtbd.md): Owner+Manager full CRUD on Ingredients/Categories/Suppliers; Staff read-only on Ingredients (no prices, no supplier data); Owner-only on Organization-level fields (currency, locale).

#### Scenario: Staff blocked from creating ingredients
- **WHEN** a Staff user POSTs to `/ingredients`
- **THEN** the system returns 403 with `{ code: "FORBIDDEN_ROLE" }`

#### Scenario: Staff sees ingredient without prices
- **WHEN** a Staff user GETs `/ingredients/:id`
- **THEN** the response includes `name`, `categoryId`, `baseUnitType`, but excludes `supplierItems[].unitPrice` and `supplierItems[].costPerBaseUnit`

#### Scenario: Manager cannot change currency
- **WHEN** a Manager PATCHes `/organizations/:id` with any field
- **THEN** the system returns 403; only Owner can edit Organization-level fields

#### Scenario: Owner has full access
- **WHEN** an Owner performs any of the above
- **THEN** the operation succeeds (subject to other validation rules)

### Requirement: Soft-delete with reactivation

The system SHALL support soft-delete via `isActive=false` on every primary entity (Ingredient, Category, Supplier). List endpoints filter `isActive=true` by default; deactivated rows are referenced from historical data with a "Discontinued" indicator. OWNER or MANAGER MAY reactivate any soft-deleted entity.

#### Scenario: Soft-delete excludes from list
- **WHEN** an Ingredient is soft-deleted (PATCH `isActive=false`) and a Manager queries `/ingredients`
- **THEN** the response excludes the deactivated row by default

#### Scenario: Include deactivated via query param
- **WHEN** a Manager queries `/ingredients?includeInactive=true`
- **THEN** deactivated rows are included with their `isActive: false` flag visible

#### Scenario: Reactivation by Manager
- **WHEN** a Manager PATCHes a soft-deleted Ingredient with `isActive=true`
- **THEN** the row reactivates; subsequent default queries include it again

#### Scenario: No physical delete in M1
- **WHEN** a Manager calls DELETE `/ingredients/:id`
- **THEN** the system performs soft-delete (sets `isActive=false`); no row leaves the database

### Requirement: Audit fields populated automatically from JWT

The system SHALL populate `createdBy` (on insert) and `updatedBy` (on update) from the authenticated user's JWT via an interceptor. DTOs SHALL NOT carry `createdBy`/`updatedBy` fields; if present, they SHALL be ignored.

#### Scenario: createdBy populated on insert
- **WHEN** an authenticated Manager POSTs to `/ingredients`
- **THEN** the persisted row has `createdBy = <manager's userId>`; `updatedBy` is null until first update

#### Scenario: updatedBy populated on update
- **WHEN** the same row is PATCHed by a different Manager
- **THEN** `updatedBy` updates to the patcher's userId; `createdBy` is unchanged

#### Scenario: Tampered DTO ignored
- **WHEN** a malicious DTO includes `createdBy: "<some-other-user>"`
- **THEN** the value is overwritten by the interceptor; the persisted row reflects the JWT user

#### Scenario: User offboarding preserves audit
- **WHEN** the User referenced by `createdBy` is hard-deleted
- **THEN** the audit row keeps `createdBy=null` (FK ON DELETE SET NULL); the historical fact is not lost via foreign-key cascade

### Requirement: i18n bundle with backend-language-agnostic errors

The system SHALL ship `/locales/es.json` and `/locales/en.json` translation bundles. Backend errors SHALL return `{ code, details }` payloads; the UI translates `code` based on the user's locale. Category seed taxonomy is the exception — those rows have `nameEs` + `nameEn` columns directly.

#### Scenario: Backend error returns code, not translated string
- **WHEN** an invalid request triggers `INGREDIENT_DUPLICATE_NAME`
- **THEN** the response body contains `{ code: "INGREDIENT_DUPLICATE_NAME", details: { existingId: "..." } }` with no human-readable text

#### Scenario: ES locale renders ES category names
- **WHEN** a Manager from an `defaultLocale=es` Org queries categories
- **THEN** the response surface uses `nameEs` (e.g. "Verduras de Hoja")

#### Scenario: Locale switch surfaces alternate translation
- **WHEN** the same Manager queries with `Accept-Language: en`
- **THEN** the response surfaces `nameEn` (e.g. "Leafy Greens")

#### Scenario: Translation files complete for V1 locales
- **WHEN** CI runs the i18n completeness check
- **THEN** every error code and UI label has both `es` and `en` keys present; no missing translations

### Requirement: CSV Import / Export with chunked transactions

The system SHALL accept CSV uploads up to 10,000 rows for Ingredient bulk-create (Manager+ only). Validation runs in 500-row chunks; a dry-run preview returns `{ valid, invalid, errors }` without persistence. Commit wraps each chunk in a transaction. List views SHALL be exportable to CSV.

#### Scenario: Dry-run preview without persistence
- **WHEN** a Manager POSTs `/ingredients/import?dryRun=true` with a 1000-row CSV containing 5 invalid rows
- **THEN** the response returns `{ valid: 995, invalid: 5, errors: [{row: 12, code: "CATEGORY_PATH_NOT_FOUND"}, ...] }`; database is unchanged

#### Scenario: Commit imports valid rows in chunks
- **WHEN** a Manager POSTs `/ingredients/import?dryRun=false` with the same 1000-row CSV
- **THEN** the system imports 995 rows (5 invalid skipped); a chunk failure mid-import does not roll back already-committed chunks

#### Scenario: 10k-row file completes within timeout
- **WHEN** a Manager uploads a 10,000-row CSV
- **THEN** the import completes within 60s (NFR §5); progress is observable via response streaming

#### Scenario: List export to CSV
- **WHEN** a Manager requests `GET /ingredients/export.csv`
- **THEN** the response is a `text/csv` payload with all visible Ingredients (respecting filters), one row per Ingredient, headers in the first row

### Requirement: InventoryCostResolver interface seam

The system SHALL expose an `InventoryCostResolver` interface (per ADR-011 — M2→M3 architectural seam) at `apps/api/src/cost/inventory-cost-resolver.ts`. M1 ships the v1 implementation that resolves cost from the `isPreferred=true` SupplierItem. M2's `m2-cost-rollup-and-audit` and M3's batch-aware version replace this implementation without changing call sites.

#### Scenario: Resolver returns preferred supplier cost
- **WHEN** `InventoryCostResolver.resolveBaseCost(ingredientId)` is called for an Ingredient with one preferred SupplierItem
- **THEN** the response is `{ costPerBaseUnit, currency, source: { kind: "supplier-item", refId, displayLabel } }`

#### Scenario: Resolver throws when no preferred supplier exists
- **WHEN** the same call is made on an Ingredient with no `isPreferred` SupplierItem
- **THEN** the resolver throws `NoCostSourceError` with `{ ingredientId }`; M2 catches this for the "missing cost data" UX path

#### Scenario: Resolver implements stable interface
- **WHEN** M2 imports `InventoryCostResolver` from `apps/api/src/cost/inventory-cost-resolver`
- **THEN** the import succeeds; M2 can swap the M1 implementation for an M3 batch-aware one via NestJS DI without code changes elsewhere
