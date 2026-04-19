import { UnitFamily, AnyUnit } from './uom';

export interface IngredientDto {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  /** Auto-generated SKU, editable */
  internalCode: string;
  /** Immutable after creation */
  baseUnitType: UnitFamily;
  /** g/ml ratio — required only for WEIGHT↔VOLUME conversion */
  densityFactor: number | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  /** Populated on detail view */
  category?: { id: string; name: string };
  /** Populated on detail view */
  preferredSupplierItem?: SupplierItemDto | null;
}

export interface CreateIngredientDto {
  name: string;
  categoryId: string;
  baseUnitType: UnitFamily;
  internalCode?: string;
  densityFactor?: number | null;
  notes?: string | null;
}

export interface UpdateIngredientDto {
  name?: string;
  categoryId?: string;
  internalCode?: string;
  densityFactor?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface SupplierItemDto {
  id: string;
  supplierId: string;
  ingredientId: string;
  /** Display label e.g. "5 kg Box" */
  purchaseUnit: string;
  purchaseUnitQty: number;
  purchaseUnitType: AnyUnit;
  /** Price per purchaseUnit in org currency */
  unitPrice: number;
  /** Auto-calculated: unitPrice / purchaseUnitQty converted to base */
  costPerBaseUnit: number;
  isPreferred: boolean;
  createdAt: string;
  updatedAt: string;
  /** Populated on detail view */
  supplier?: { id: string; name: string };
}

/** Cursor-based pagination — consistent across all list endpoints (ADR-002) */
export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}
