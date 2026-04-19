# Data Model — Entity Relationship Diagram (ERD)

**Project:** openTrattOS  
**Scope:** Module 1 (Foundation) + Shared Entities  
**Date:** 2026-04-19

---

## 1. Entity Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ Location : "has many"
    Organization ||--o{ User : "has many"
    Organization ||--o{ Ingredient : "has many"
    Organization ||--o{ Supplier : "has many"
    Organization ||--o{ Category : "has many"

    User }o--|| Organization : "belongs to"
    User }o--o{ Location : "assigned to (via UserLocation)"

    Location }o--|| Organization : "belongs to"

    Category ||--o{ Category : "parent → children (self-ref)"
    Category ||--o{ Ingredient : "classifies"

    Ingredient ||--o{ SupplierItem : "sourced via"
    Ingredient }o--|| Category : "belongs to"

    Supplier ||--o{ SupplierItem : "offers"

    Organization {
        uuid id PK
        string name
        string currencyCode "EUR, USD, etc. Immutable"
        string defaultLocale "es, en, fr..."
        string timezone
        datetime createdAt
        datetime updatedAt
    }

    Location {
        uuid id PK
        uuid organizationId FK
        string name
        string address
        enum type "RESTAURANT | BAR | DARK_KITCHEN | CATERING | CENTRAL_PRODUCTION"
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    User {
        uuid id PK
        uuid organizationId FK
        string name
        string email "unique per org"
        string passwordHash
        enum role "OWNER | MANAGER | STAFF"
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Category {
        uuid id PK
        uuid organizationId FK
        uuid parentId FK "nullable, self-referencing"
        string name
        string nameEs "translated name (Spanish)"
        string nameEn "translated name (English)"
        int sortOrder
        boolean isDefault "true = came from seed"
        datetime createdAt
        datetime updatedAt
    }

    Ingredient {
        uuid id PK
        uuid organizationId FK
        uuid categoryId FK
        string name
        string internalCode "auto-generated SKU, editable"
        enum baseUnitType "WEIGHT | VOLUME | UNIT — immutable after creation"
        float densityFactor "nullable — g/ml, required for cross-family conversion"
        string notes "nullable"
        boolean isActive "soft delete — default true"
        uuid createdBy FK
        uuid updatedBy FK
        datetime createdAt
        datetime updatedAt
    }

    Supplier {
        uuid id PK
        uuid organizationId FK
        string name
        string contactName "nullable"
        string email "nullable"
        string phone "nullable"
        string country
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    SupplierItem {
        uuid id PK
        uuid supplierId FK
        uuid ingredientId FK
        string purchaseUnit "display label e.g. '5 kg Box'"
        float purchaseUnitQty "e.g. 5"
        enum purchaseUnitType "must match ingredient baseUnitType family"
        decimal unitPrice "price per purchaseUnit in org currency"
        decimal costPerBaseUnit "auto-calculated: unitPrice / purchaseUnitQty converted to base"
        boolean isPreferred "default supplier for food cost calc"
        datetime createdAt
        datetime updatedAt
    }
```

---

## 2. Key Design Rules

### 2.1 Soft Delete
- Entities with `isActive` field are **never physically deleted**.
- Deactivated records:
  - Disappear from all default list views (filtered by `isActive = true`)
  - Remain visible in historical recipes and reports that reference them (shown greyed out with a "discontinued" badge)
  - Can be reactivated by an `OWNER` or `MANAGER`

### 2.2 Audit Fields
Every primary entity includes:
- `createdAt` (auto-set on insert)
- `updatedAt` (auto-set on every update)
- `createdBy` / `updatedBy` (FK → User, set by auth middleware)

This provides a basic **audit trail** for compliance. A full audit log table 
(storing field-level diffs) is reserved for Module 3 (HACCP) where regulatory 
traceability demands it.

### 2.3 Cascade & Referential Integrity

| Parent | Child | On Delete |
|---|---|---|
| Organization | Location, User, Ingredient, Supplier, Category | `CASCADE` (delete org = delete everything) |
| Category | Ingredient | `RESTRICT` (cannot delete a category that has ingredients) |
| Category | Category (children) | `RESTRICT` (cannot delete a parent with children) |
| Supplier | SupplierItem | `CASCADE` (delete supplier = delete its items) |
| Ingredient | SupplierItem | `CASCADE` (delete ingredient = delete its supplier links) |

### 2.4 Currency
- Currency is set at `Organization` level (`currencyCode` field, ISO 4217).
- **All monetary values** (`unitPrice`, `costPerBaseUnit`) are stored and displayed in the organization's currency.
- Multi-currency support (e.g. a supplier billing in USD to a EUR organization) is **out of scope for V1**. Reserved for future enhancement.
