## ADDED Requirements

### Requirement: Generate EU 1169/2011 compliant printable label for any Recipe

The system SHALL expose `GET /recipes/:id/label?locale=<lang>` returning a printable PDF for the Recipe in the specified locale (defaulting to org `defaultLocale`). The PDF SHALL comply with EU 1169/2011 mandatory particulars per Articles 9, 18, 21, and 30.

#### Scenario: Generate label in default locale
- **WHEN** an authenticated user calls `GET /recipes/:id/label`
- **THEN** the response is a streaming PDF with `Content-Type: application/pdf` containing the recipe's label in the org's `defaultLocale`

#### Scenario: Generate label in explicit locale
- **WHEN** an authenticated user calls `GET /recipes/:id/label?locale=es`
- **THEN** the response is a Spanish-language label

#### Scenario: PDF render latency p95 <2s
- **WHEN** label generation is invoked under typical load
- **THEN** the PDF stream begins within 2 seconds (p95)

### Requirement: Article 18 — ingredients ordered by descending mass

The label SHALL list ingredients in descending order of mass at render time, computed from `quantity × yield × (1 − waste)` across the Recipe tree.

#### Scenario: Single-level recipe ordering
- **WHEN** a Recipe has 4 ingredients with finished masses 200g / 150g / 80g / 50g
- **THEN** the label ingredient list reads in that order

#### Scenario: Sub-recipe ingredients flatten and re-rank
- **WHEN** a Recipe contains a sub-recipe whose ingredients sum to >200g of one component
- **THEN** that component appears earlier in the parent's ingredient list, ranked correctly across direct + indirect sources

### Requirement: Article 21 — allergens emphasised with icon + text always

The label SHALL emphasise the 14 named allergens per Article 21 using bold + high-contrast styling. Allergens SHALL render with both an icon AND the text label; colour SHALL never be the sole signifier.

#### Scenario: Allergen emphasised in ingredient list
- **WHEN** an ingredient contains "milk"
- **THEN** "milk" in the label's ingredient list is rendered bold, in high-contrast colour, with a milk-glyph icon adjacent to the text

#### Scenario: Cross-contamination disclosure if recorded on Recipe
- **WHEN** the Recipe has cross-contamination notes (`#7 m2-allergens-article-21`)
- **THEN** the label includes a "May contain traces of [...]" disclosure with allergen icons

### Requirement: Refusal-on-incomplete with named missing fields

The system SHALL refuse to render a label if any mandatory Article-9 field is missing on the Recipe or Org. The error SHALL name every missing field.

#### Scenario: Missing org contact info
- **WHEN** a label is requested for an org that has not configured contact info
- **THEN** the system returns 422 with `{code: "MISSING_MANDATORY_FIELDS", missing: ["org.contactInfo", "org.businessName"]}`; no PDF emitted

#### Scenario: Missing Recipe macros
- **WHEN** a Recipe has no resolvable macroRollup (an underlying Ingredient has null `nutrition`)
- **THEN** the response returns 422 naming the missing fields (e.g. `["recipe.macros.kcal"]`)

#### Scenario: All mandatory fields populated — PDF emits
- **WHEN** every mandatory field is populated
- **THEN** the PDF emits successfully

### Requirement: Owner configures org-level label fields

The system SHALL expose `PUT /orgs/:id/label-fields` (Owner role only) persisting `contactInfo`, `address`, `brandMark`, `postalAddress`. These populate the label header/footer.

#### Scenario: Owner configures fields
- **WHEN** an Owner posts complete label-field config to `/orgs/:id/label-fields`
- **THEN** the values persist; subsequent label generations include them

#### Scenario: Manager attempt blocked
- **WHEN** a Manager attempts to PUT label-fields
- **THEN** the system returns 403 Forbidden

#### Scenario: Partial config rejected
- **WHEN** an Owner submits partial fields (e.g. missing `contactInfo`)
- **THEN** the system returns 422 with `{code: "INCOMPLETE_LABEL_CONFIG", missing}`

### Requirement: Locale renders in org defaultLocale or explicit override

The label SHALL render in the org's `defaultLocale` unless an explicit `?locale=` query parameter is supplied. Bilingual labels are out of M2 scope.

#### Scenario: Default locale used
- **WHEN** a request omits `?locale=` and the org `defaultLocale=es`
- **THEN** the label renders in Spanish

#### Scenario: Explicit locale override
- **WHEN** a request supplies `?locale=en`
- **THEN** the label renders in English

#### Scenario: Unsupported locale rejected
- **WHEN** a request supplies `?locale=zz` (no translations available)
- **THEN** the system returns 422 with `{code: "UNSUPPORTED_LOCALE", supported: ["es", "en", "it"]}`

### Requirement: Print workflow ≤3 clicks per NFR

The UI SHALL allow the chef to print a recipe label in 3 clicks or fewer from the Recipe view.

#### Scenario: Three-click print
- **WHEN** a chef views a Recipe and wants to print its label
- **THEN** the chef can click "Print Label" → review preview → confirm print, totalling 3 clicks

#### Scenario: Direct-to-PDF without print step
- **WHEN** a chef clicks "Download Label" instead of print
- **THEN** the PDF downloads in 1 click after the preview is open
