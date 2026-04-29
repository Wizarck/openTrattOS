## Why

A Recipe is a cost; a MenuItem is the actual sellable thing — Recipe × Location × Channel with a sellingPrice and a target margin. Without MenuItem + margin computation, M2's Owner-reporting (Journey 3, slice #9) has nothing to rank. This is also the entity that lets a Manager wire the same Recipe to multiple Locations / channels with different prices. Journey 1 (chef finishes a recipe) ends with a MenuItem creation; Journey 3 (Owner Sunday-night dashboard) reads from these.

## What Changes

- MenuItem CRUD service + endpoints (FR29–32): create / read / update / soft-delete.
- Manager creates a MenuItem linking exactly one Recipe × one Location × one Channel (FR29).
- `sellingPrice` in org currency + `targetMargin` per MenuItem (FR30).
- Read-time computation of actual margin (`sellingPrice − liveRecipeCost`) and percent vs `targetMargin`, with status colour per ADR-016 (FR31).
- Margin report per MenuItem showing cost / sellingPrice / margin (absolute + %) / target-margin status (FR32).
- `MarginPanel` UI component (shared with #3 — already built there if #3 lands first; otherwise built here; either way idempotent).
- Multi-tenant invariant + cascade rules per ADR-010 (`organizationId` on MenuItem; cascade follows Recipe + Location + org).
- RBAC: Owner/Manager can write; Staff is read-only.
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-menus-margins`: MenuItem CRUD + read-time margin computation + status colour per ADR-016.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#1 m2-data-model` (MenuItem entity), `#2 m2-recipes-core` (Recipe contract for the FK), `#3 m2-cost-rollup-and-audit` (`liveRecipeCost` accessor).
- **Code**: `apps/api/src/menu-items/` (service + controller), `packages/ui-kit/src/margin-panel/` (shared with #3).
- **API surface**: `POST/GET/PUT/DELETE /menu-items`, `GET /menu-items/:id/margin`. Public REST per ADR-013.
- **Out of scope**: top/bottom-5 ranking (#9). Owner-facing dashboard ships next.
- **Performance**: live margin update <200ms.
