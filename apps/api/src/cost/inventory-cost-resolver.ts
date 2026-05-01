/**
 * InventoryCostResolver — the M2→M3 architectural seam (ADR-011 / design.md §D11).
 *
 * M1 implementation walks `SupplierItem` for the ingredient, picks
 * `isPreferred=true`, returns `costPerBaseUnit` + currency + a source ref.
 * M3 will replace the implementation with a batch-aware resolver via NestJS
 * DI without touching call sites — that is the whole point of pinning the
 * interface in `cost/`, OUTSIDE both `ingredients/` and `suppliers/`.
 *
 * M2's `m2-cost-rollup-and-audit` slice consumes this interface to drive
 * recipe escandallo without knowing whether costs come from supplier-item
 * preferred rows (M1) or batch FIFO/LIFO accounting (M3).
 */

export type CostSourceKind = 'supplier-item' | 'batch';

export interface CostSource {
  kind: CostSourceKind;
  /** The id of the row that drove the cost (SupplierItem.id in M1, Batch.id in M3). */
  refId: string;
  /** Human-readable label for audit / "what changed?" UIs (e.g. "Distribuidora Levante — 5 kg Box"). */
  displayLabel: string;
}

export interface ResolvedCost {
  /** Cost per single base unit of the ingredient (€/g for WEIGHT, €/ml for VOLUME, €/pcs for UNIT). */
  costPerBaseUnit: number;
  /** ISO 4217 currency code; equals the ingredient's organization.currencyCode. */
  currency: string;
  source: CostSource;
}

export interface InventoryCostResolver {
  /**
   * Returns the current cost for an ingredient. The optional `asOf` parameter
   * is reserved for M3 batch-aware lookups (point-in-time accounting); M1
   * implementations may ignore it (or assert it equals "now") since M1 has
   * no temporal cost history.
   */
  resolveBaseCost(ingredientId: string, asOf?: Date): Promise<ResolvedCost>;
}

export class NoCostSourceError extends Error {
  readonly ingredientId: string;
  constructor(ingredientId: string, detail = '') {
    super(
      `No cost source available for ingredient ${ingredientId}${detail ? `: ${detail}` : ''}`,
    );
    this.name = 'NoCostSourceError';
    this.ingredientId = ingredientId;
  }
}

/**
 * Symbol used as the DI token for `InventoryCostResolver`. Bind the M1
 * implementation against this token in `IamModule` (or wherever the seam
 * is wired) so M2 / M3 swaps stay drop-in.
 */
export const INVENTORY_COST_RESOLVER = Symbol.for('opentrattos.InventoryCostResolver');
