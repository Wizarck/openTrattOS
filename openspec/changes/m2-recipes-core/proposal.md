## Why

Recipes are the spine of Module 2 — every cost rollup (#3), AI suggestion (#6), allergen aggregation (#7), MenuItem (#8), and label (#10) reads from a Recipe. Journey 1 (Head Chef builds a new recipe) and Journey 4 (cycle-detection edge case) live in this slice. Without a clean CRUD + cycle guard, every downstream slice has to defensively guard the Recipe contract.

## What Changes

- Recipes service + endpoints implementing FR1–8: create, read, update, soft-delete with sub-recipe composition.
- `RecipePicker` UI component (per `docs/ux/components.md`) for selecting existing Recipes when composing sub-recipes.
- Cycle detection on save: graph-walk algorithm with depth cap 10 (NFR Scalability) emitting an error naming both nodes and the direction of the cycle, satisfying Journey 4 acceptance.
- Soft-delete UX (FR7): deleted Recipes appear in dependent MenuItem refs with a "Discontinued" badge and are not selectable as new sub-recipes.
- Audit fields populated automatically per PRD-1 pattern (FR8).
- RBAC enforcement: Owner/Manager can create/update/delete; Staff is read-only.
- **BREAKING** (none — new endpoints, no existing M1 contract changed).

## Capabilities

### New Capabilities

- `m2-recipes-core`: Recipe CRUD with sub-recipe composition + cycle detection. Surface for Journey 1 happy-path and Journey 4 edge case.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#1 m2-data-model` schema must land first.
- **Code**: `apps/api/src/recipes/` (service + controller + tests), `packages/ui-kit/src/recipe-picker/` (component).
- **API surface**: `POST/GET/PUT/DELETE /recipes` plus sub-recipe composition payload. Public REST API per ADR-013 Agent-Ready (every action reachable via API; UI is one consumer).
- **Out of scope**: cost rollup (#3), AI yield/waste suggestions (#6), label generation (#10). This change ships *only* the recipe contract.
- **Performance**: recipe view <1s on slow Wi-Fi (kitchen tablet) per NFR.
