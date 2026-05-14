// ============================================================
// Cost-resolver domain errors (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Typed errors thrown by the FIFO/FEFO resolver path. All errors set
// `name` to the class name for clean `instanceof` checks and JSON
// serialization in audit-log payloads (slice #5 reads `error.name`).

/**
 * Thrown when `sum(lot.quantityRemaining) < qtyNeeded` per
 * ADR-COST-INSUFFICIENT-INVENTORY. The resolver does NOT return a
 * partial breakdown — caller decides whether to fall back to the M2
 * supplier-list-price path or surface the shortage to the operator.
 *
 * Fields are public + readonly so callers (M2 `CostService` catch
 * block, slice #5 snapshot persistence) can surface them in audit
 * envelopes without re-parsing the message.
 */
export class InsufficientInventoryError extends Error {
  readonly organizationId: string;
  readonly productId: string;
  readonly quantityRequested: number;
  readonly quantityAvailable: number;
  readonly quantityShortfall: number;

  constructor(
    organizationId: string,
    productId: string,
    quantityRequested: number,
    quantityAvailable: number,
  ) {
    const shortfall = quantityRequested - quantityAvailable;
    super(
      `Insufficient inventory for product ${productId} in org ${organizationId}: ` +
        `requested ${quantityRequested}, available ${quantityAvailable} ` +
        `(shortfall ${shortfall})`,
    );
    this.name = 'InsufficientInventoryError';
    this.organizationId = organizationId;
    this.productId = productId;
    this.quantityRequested = quantityRequested;
    this.quantityAvailable = quantityAvailable;
    this.quantityShortfall = shortfall;
  }
}

/**
 * Thrown when the DB returns a strategy value not in the
 * `Strategy` enum. Defence-in-depth against schema drift (e.g., a
 * future migration introduces 'LIFO' without updating the resolver).
 * The CHECK constraint on the products column is the primary defence;
 * this is the runtime safety net.
 */
export class UnknownStrategyError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(
      `Unknown cost-resolution strategy: ${value}. Expected one of FIFO, FEFO, MANUAL.`,
    );
    this.name = 'UnknownStrategyError';
    this.value = value;
  }
}

/**
 * Thrown when the org-policy override column carries `'MANUAL'` —
 * the DB CHECK constraint should prevent this, but the resolver
 * surfaces a typed error if it ever happens (corrupted row, prior
 * migration without CHECK, etc.).
 */
export class StrategyMismatchError extends Error {
  readonly organizationId: string;
  readonly value: string;

  constructor(organizationId: string, value: string) {
    super(
      `Org ${organizationId} has invalid cost-resolution-policy-override ` +
        `value '${value}'. Org-level override accepts only FIFO or FEFO; ` +
        `MANUAL is product-level only.`,
    );
    this.name = 'StrategyMismatchError';
    this.organizationId = organizationId;
    this.value = value;
  }
}
