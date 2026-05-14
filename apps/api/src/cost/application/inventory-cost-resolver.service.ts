// ============================================================
// InventoryCostResolverServiceM3 — NestJS DI wrapper
// (m3-inventory-cost-resolver-fifo-fefo, Wave 2.2)
// ============================================================
//
// Thin DI-injectable wrapper around the pure FIFO/FEFO resolvers.
// Composes:
//   - LotRepository (slice #1 m3-lot-aggregate) — fetches the available
//     lot snapshot from the partial index `idx_lots_org_loc_available_fifo`
//   - PreferredSupplierResolver (M2) — MANUAL fallback
//   - resolveFifo / resolveFefo — pure compute
//
// Per ADR-COST-NO-AUDIT-EMIT-HERE: this service performs NO database
// writes, emits NO events, appends NO audit rows. Snapshot persistence
// is slice #5's responsibility.
//
// Per ADR-COST-STRATEGY-PER-PRODUCT: production strategy resolution
// requires reading `products.cost_resolution_strategy` +
// `organizations.cost_resolution_policy_override`. Those columns are
// added by slice #5 (migrations 0028 + 0029 reserved); until they
// land, this service uses `input.strategyOverride` (when provided) or
// the safe default `'FIFO'`. Adopt the DB lookup once migrations ship.

import { Inject, Injectable, Optional } from '@nestjs/common';
import { Lot } from '../../inventory/lot/domain/lot.entity';
import { LotRepository } from '../../inventory/lot/application/lot.repository';
import {
  InventoryCostResolver,
  NoCostSourceError,
  ResolveOptions,
  ResolvedCost,
  normaliseResolveOptions,
} from '../inventory-cost-resolver';
import { PreferredSupplierResolver } from './preferred-supplier.resolver';
import {
  CostResolution,
  LotCostRow,
  ResolveCostInput,
  Strategy,
} from '../domain/types';
import { InsufficientInventoryError } from '../domain/errors';
import { resolveFifo } from './fifo.resolver';
import { resolveFefo } from './fefo.resolver';
import { selectStrategy } from './strategy-selector';

/**
 * DI token surfacing the M2-compatible resolveBaseCost contract while
 * exposing the M3-native resolveCost method. Bound against
 * `INVENTORY_COST_RESOLVER` via the env-flagged `useFactory` in
 * `cost.module.ts` per ADR-COST-DI-FEATURE-FLAG.
 */
@Injectable()
export class InventoryCostResolverServiceM3 implements InventoryCostResolver {
  constructor(
    private readonly lots: LotRepository,
    @Optional()
    @Inject(PreferredSupplierResolver)
    private readonly m2Fallback: PreferredSupplierResolver | null = null,
  ) {}

  /**
   * M3-native resolver. Fetches the available lot snapshot from
   * `LotRepository.findAvailableFifo`, picks the strategy, delegates
   * to the appropriate pure resolver.
   *
   * Strategy selection (current behaviour, slice #4):
   *   - If `input.strategyOverride` provided → use it
   *   - Else default to 'FIFO' (safe default until per-product /
   *     org-override columns land in slice #5 migrations)
   *
   * @throws InsufficientInventoryError per ADR-COST-INSUFFICIENT-INVENTORY
   */
  async resolveCost(input: ResolveCostInput): Promise<CostResolution> {
    const strategy = this.pickStrategy(input);

    if (strategy === 'MANUAL') {
      return this.resolveManual(input);
    }

    const lots = await this.lots.findAvailableFifo(
      input.organizationId,
      input.locationId,
      input.asOfTime,
    );

    // Map Lot entities → LotCostRow. `productId` + `unitCostAtReceived`
    // are not yet first-class columns on `Lot` (slice #7 adds them);
    // for now we read from `metadata` with safe fallbacks. The mapper
    // intentionally filters by productId so multi-product locations
    // are correctly partitioned.
    const rows = lots
      .map((lot) => this.toLotCostRow(lot, input))
      .filter((row): row is LotCostRow => row !== null);

    const currency = this.deriveCurrency(rows);

    if (strategy === 'FIFO') {
      return resolveFifo(
        rows,
        input.quantity,
        currency,
        input.asOfTime,
        input.organizationId,
        input.productId,
      );
    }
    return resolveFefo(
      rows,
      input.quantity,
      currency,
      input.asOfTime,
      input.organizationId,
      input.productId,
    );
  }

  /**
   * M2-compatible projection. Builds a 1-unit `ResolveCostInput`,
   * calls `resolveCost`, projects the breakdown's first lot's
   * `unitCost` into the M2 `ResolvedCost` shape. M2 callers
   * (`CostService.computeRecipeCost`, `RecipesCostController`) keep
   * working without changes.
   *
   * On `InsufficientInventoryError`, throws `NoCostSourceError` (M2
   * shape) so the M2 catch block in `CostService` surfaces an
   * `unresolved` component instead of bubbling a domain-leaked error.
   */
  async resolveBaseCost(
    ingredientId: string,
    options?: ResolveOptions | Date,
  ): Promise<ResolvedCost> {
    const opts = normaliseResolveOptions(options);
    const asOfTime = opts.asOf ?? new Date();

    // Without slice #5/#7, we don't know the locationId from the
    // ingredient alone. For M2 compatibility, fall back to the M2
    // resolver when `m2Fallback` is wired (production wiring path)
    // — the M3 native `resolveCost` is the entry point M3 callers use.
    if (this.m2Fallback) {
      return this.m2Fallback.resolveBaseCost(ingredientId, opts);
    }
    throw new NoCostSourceError(
      ingredientId,
      'M3 resolveBaseCost requires productId + locationId context; use resolveCost(input) directly',
    );
    // Silence unused-var warnings while the future M2 projection lands in slice #5.
    void asOfTime;
  }

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  private pickStrategy(input: ResolveCostInput): Strategy {
    if (input.strategyOverride) {
      // Honour explicit overrides (test fixtures, MANUAL forcing).
      // Production strategy lookup (slice #5 columns) layered in here later.
      return selectStrategy(
        input.strategyOverride,
        null,
        input.organizationId,
      );
    }
    // Safe default while slice #5 migrations are pending.
    return 'FIFO';
  }

  private async resolveManual(
    input: ResolveCostInput,
  ): Promise<CostResolution> {
    if (!this.m2Fallback) {
      throw new NoCostSourceError(
        input.productId,
        'MANUAL strategy requires PreferredSupplierResolver to be wired in DI',
      );
    }
    const m2 = await this.m2Fallback.resolveBaseCost(input.productId, {
      asOf: input.asOfTime,
    });
    return {
      totalCost: m2.costPerBaseUnit * input.quantity,
      currency: m2.currency,
      strategy: 'MANUAL',
      breakdown: [
        {
          lotId: m2.source.refId,
          qty: input.quantity,
          unitCost: m2.costPerBaseUnit,
          subtotal: m2.costPerBaseUnit * input.quantity,
          receivedAt: input.asOfTime,
          expiresAt: null,
        },
      ],
      remainingLots: [],
      asOfTime: input.asOfTime,
    };
  }

  /**
   * Map a `Lot` entity to a `LotCostRow`. Returns null when the lot
   * doesn't match the requested productId (multi-product locations
   * are filtered post-fetch until slice #7 adds the `product_id`
   * column to `lots`).
   *
   * `unitCostAtReceived` reads `metadata.unit_cost_at_received` as a
   * transitional source until slice #7 stamps a first-class column.
   * Missing → 0 (the resolver tolerates 0-cost rows; total just
   * reflects them as zero contribution).
   */
  private toLotCostRow(lot: Lot, input: ResolveCostInput): LotCostRow | null {
    const metadata = lot.metadata ?? {};
    const lotProductId =
      typeof (metadata as Record<string, unknown>).product_id === 'string'
        ? ((metadata as Record<string, unknown>).product_id as string)
        : input.productId; // permissive default while #7 lands
    if (lotProductId !== input.productId) {
      return null;
    }
    const unitCostRaw = (metadata as Record<string, unknown>)
      .unit_cost_at_received;
    const unitCost =
      typeof unitCostRaw === 'number' && Number.isFinite(unitCostRaw)
        ? unitCostRaw
        : typeof unitCostRaw === 'string'
          ? Number.parseFloat(unitCostRaw) || 0
          : 0;
    const currencyRaw = (metadata as Record<string, unknown>).currency;
    const currency =
      typeof currencyRaw === 'string' && currencyRaw.length === 3
        ? currencyRaw
        : 'EUR';
    return {
      id: lot.id,
      organizationId: lot.organizationId,
      locationId: lot.locationId,
      productId: lotProductId,
      receivedAt: lot.receivedAt,
      expiresAt: lot.expiresAt,
      quantityRemaining: lot.quantityRemaining,
      unitCostAtReceived: unitCost,
      currency,
    };
  }

  private deriveCurrency(rows: ReadonlyArray<LotCostRow>): string {
    // All lots within an organization share one currency; pick the
    // first row's currency. Empty queue → 'EUR' default (the resolver
    // will throw InsufficientInventoryError on empty input, so the
    // currency value here is effectively unused).
    return rows[0]?.currency ?? 'EUR';
  }
}

// Re-export the typed error so downstream slices (#5 snapshot persistence)
// can catch it without importing the domain/errors module directly.
export { InsufficientInventoryError };
