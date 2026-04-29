## ADDED Requirements

### Requirement: Recipe allergen aggregation is conservative — never auto-clear

The system SHALL aggregate Recipe-level allergens from all Ingredients (direct + sub-recipe) using conservative inference: ANY allergen in ANY Ingredient bubbles up to the Recipe. The system SHALL NEVER auto-clear an allergen.

#### Scenario: Single ingredient with allergen bubbles up
- **WHEN** a Recipe contains an Ingredient with `allergens=["gluten"]`
- **THEN** `GET /recipes/:id/allergens` returns `aggregated=["gluten"]` with attribution `{gluten: [<ingredientId>]}`

#### Scenario: Multiple sources of same allergen attribute correctly
- **WHEN** a Recipe contains 3 Ingredients each carrying "milk"
- **THEN** `aggregated=["milk"]` (deduplicated) and attribution lists all 3 ingredient IDs

#### Scenario: Sub-recipe allergens propagate
- **WHEN** a Recipe contains a sub-recipe whose Ingredients carry "egg" + "soy"
- **THEN** the parent Recipe's `aggregated` includes both, with attribution chain `{egg: [<subRecipeId> → <ingredientId>], ...}`

#### Scenario: Removing an Ingredient cleans up that source
- **WHEN** an Ingredient is removed from the Recipe
- **THEN** if no other Ingredient still carries the allergen, it is removed from `aggregated`; if other sources remain, it stays

### Requirement: Cross-contamination notes capture production-line risks

The system SHALL allow Manager+ users to record a recipe-level cross-contamination note ("may contain traces of [X]") with free-text description AND structured allergen tagging.

#### Scenario: Manager adds cross-contamination
- **WHEN** a Manager PUTs `/recipes/:id/cross-contamination` with `{note: "Made on shared line with peanuts", allergens: ["peanuts"]}`
- **THEN** the Recipe persists `crossContaminationNote` and `crossContaminationAllergens=["peanuts"]`

#### Scenario: Free text without structured tags is rejected
- **WHEN** a Manager submits a note without populating the structured `allergens` array
- **THEN** the system returns 422 with `{code: "STRUCTURED_TAGS_REQUIRED"}`

#### Scenario: Cross-contamination is visible separately from aggregated
- **WHEN** `GET /recipes/:id/allergens` is called
- **THEN** the response includes `aggregated` (from ingredient lineage) AND `crossContamination` (from Manager note) as distinct fields

### Requirement: Diet flag inference is conservative — all-ingredients-must-carry

The system SHALL infer Recipe-level diet flags conservatively: a flag is true only if (a) every Ingredient carries it AND (b) no contradicting allergen is present. Conflicting data SHALL result in the flag being false (never claimed).

#### Scenario: All ingredients vegan, no animal allergens — flag true
- **WHEN** every Ingredient in a Recipe carries `dietFlags=["vegan"]` and no allergen contradicts
- **THEN** `GET /recipes/:id/diet-flags` returns `inferred={vegan: true}`

#### Scenario: One ingredient missing the flag — flag false
- **WHEN** 4 of 5 Ingredients carry "vegan" but one does not
- **THEN** `inferred.vegan=false`

#### Scenario: Allergen contradicts diet flag — flag false
- **WHEN** all Ingredients carry "vegan" but one carries `allergens=["milk"]` (data inconsistency)
- **THEN** `inferred.vegan=false`; the response includes a `warnings` array noting the contradiction

### Requirement: Manager+ can override aggregated allergens or inferred diet flags with attribution

The system SHALL allow Manager+ users to override aggregated allergens or inferred diet flags. Every override SHALL require a reason and SHALL be audited in `audit_log`.

#### Scenario: Manager overrides allergen list
- **WHEN** a Manager PUTs `/recipes/:id/allergens-override` with `{add: ["sesame"], remove: [], reason: "Sesame oil added in finishing step not captured at ingredient level"}`
- **THEN** the override is applied; the response merges base + override; an `audit_log` row is written

#### Scenario: Override without reason rejected
- **WHEN** an override is submitted without a `reason`
- **THEN** the system returns 422 with `{code: "REASON_REQUIRED"}`

#### Scenario: Staff cannot override
- **WHEN** a Staff user attempts `PUT /recipes/:id/allergens-override`
- **THEN** the system returns 403 Forbidden

### Requirement: AllergenBadge renders Article 21 compliant — icon + text always, never colour-only

The AllergenBadge UI component SHALL render every allergen with a high-contrast badge that combines an icon and the allergen text label. Colour SHALL never be the sole signifier.

#### Scenario: Allergen renders with icon + text
- **WHEN** a Recipe with `aggregated=["gluten"]` is displayed
- **THEN** the AllergenBadge renders an icon (e.g. wheat glyph) AND the visible label "Gluten" — both present, screen-reader friendly

#### Scenario: High-contrast colour without colour-as-sole-signifier
- **WHEN** a user with deuteranopia (red-green colourblindness) views the badge
- **THEN** the icon + label remain identifiable independent of the badge's colour fill

#### Scenario: Cross-contamination renders distinctly from aggregated
- **WHEN** a Recipe has cross-contamination notes
- **THEN** the badge renders with a "may contain" prefix or distinct outline, with both icon and "may contain [X]" text visible
