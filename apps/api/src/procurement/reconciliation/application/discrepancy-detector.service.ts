import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { GoodsReceipt } from '../../gr/domain/goods-receipt.entity';
import type { GoodsReceiptLine } from '../../gr/domain/goods-receipt-line.entity';
import type { PurchaseOrder } from '../../po/domain/purchase-order.entity';
import type { PurchaseOrderLine } from '../../po/domain/purchase-order-line.entity';
import {
  DiscrepancyType,
  Reconciliation,
} from '../domain/reconciliation.entity';

/**
 * Floating-point epsilon for numeric comparisons. `numeric(18,4)` round
 * trips give us 4 decimal places of precision; anything inside 1e-6 is
 * accounting noise (matches the GR variance detector's 1e-9 tolerance
 * but is intentionally looser here — the operator-facing reconciliation
 * surface should not flash on the last decimal of a kg-priced item).
 */
const EPSILON = 1e-6;

/**
 * Input shape consumed by {@link DiscrepancyDetectorService.detect}.
 * Pulls the PO header + lines + GR header + lines through plain
 * properties so the detector is unit-test friendly (no repo wiring).
 *
 * The caller is responsible for cross-tenancy: all rows MUST share the
 * same `organizationId`. The detector trusts the caller and does not
 * re-validate (the GR confirmation seam already enforces this).
 */
export interface DetectInput {
  po: PurchaseOrder;
  poLines: PurchaseOrderLine[];
  gr: GoodsReceipt;
  grLines: GoodsReceiptLine[];
}

/**
 * Sprint 4 W3-5b — pure-domain discrepancy detector for the j11
 * Reconciliación tab (docs/ux/j11.md §6).
 *
 * Compares each GR line against its matching PO line (by `po_line_id`,
 * already enforced at GR confirmation per ADR-GR-LOT-CREATION-SEAM) and
 * emits zero or more {@link Reconciliation} entities. The caller is
 * responsible for persistence — keeping the detector pure means the GR
 * confirmation seam can compose detect → persist inside the same
 * transaction without juggling repository contracts.
 *
 * Detection rules:
 *
 *  - **cantidad** — `gr.qtyReceivedActual !== po.quantityOrdered`. Any
 *    delta outside EPSILON. Pairs the under-receipt + over-receipt cases
 *    (the GR variance detector handles tolerance bands for events; the
 *    reconciliation row exists for the operator to attribute the diff).
 *
 *  - **producto** — `gr.productId !== po.ingredientId`. Operator scanned
 *    the wrong SKU. This shouldn't happen in well-formed flows (GR
 *    confirmation copies the PO line's product) but we keep the check
 *    so a future independent-GR-with-po-link flow doesn't silently
 *    corrupt the chain of custody.
 *
 *  - **precio** — `gr.unitPriceActual !== po.unitPrice`. Same EPSILON
 *    tolerance. Surfaces supplier-price-list drift independently of the
 *    GR variance event (which encodes a threshold band; the
 *    reconciliation row records the raw diff for credit-note workflows).
 *
 *  - **lote-no-conforme** — RESERVED. `GoodsReceiptLine` does not yet
 *    carry a lot quality status field (verified entity definition,
 *    Sprint 4 W3-5b). Skipped at the detector layer; followup
 *    `m3-gr-lot-quality-flag` will (a) add the column + migration,
 *    (b) emit the rule here, (c) extend tests.
 *
 * Each emitted Reconciliation row has:
 *  - `id` = fresh uuid
 *  - `state` = 'abierta'
 *  - `poId` / `poNumber` denormalised so the j11 list does not join
 *  - `diff` = type-specific structured payload (see entity JSDoc)
 *
 * Lines without a matching PO line (`po_line_id IS NULL` — independent
 * GRs) are skipped. The detector emits nothing for them.
 */
@Injectable()
export class DiscrepancyDetectorService {
  detect(input: DetectInput): Reconciliation[] {
    const { po, poLines, gr, grLines } = input;
    const poLineById = new Map<string, PurchaseOrderLine>();
    for (const line of poLines) {
      poLineById.set(line.id, line);
    }

    const out: Reconciliation[] = [];

    for (const grLine of grLines) {
      if (grLine.poLineId === null) {
        continue;
      }
      const poLine = poLineById.get(grLine.poLineId);
      if (!poLine) {
        // GR line claims a PO line id we don't have a row for. The
        // GR confirmation seam enforces this invariant at write time;
        // surfacing a quiet skip here keeps the detector total without
        // hiding a real upstream bug (logged at the caller).
        continue;
      }

      // Rule 1 — cantidad
      if (Math.abs(grLine.qtyReceivedActual - poLine.quantityOrdered) > EPSILON) {
        out.push(
          buildRow({
            po,
            gr,
            grLine,
            poLine,
            discrepancyType: 'cantidad',
            diff: {
              expectedQty: poLine.quantityOrdered,
              actualQty: grLine.qtyReceivedActual,
              unit: poLine.unit,
            },
          }),
        );
      }

      // Rule 2 — producto
      if (grLine.productId !== poLine.ingredientId) {
        out.push(
          buildRow({
            po,
            gr,
            grLine,
            poLine,
            discrepancyType: 'producto',
            diff: {
              expectedProductId: poLine.ingredientId,
              actualProductId: grLine.productId,
            },
          }),
        );
      }

      // Rule 3 — precio
      if (Math.abs(grLine.unitPriceActual - poLine.unitPrice) > EPSILON) {
        out.push(
          buildRow({
            po,
            gr,
            grLine,
            poLine,
            discrepancyType: 'precio',
            diff: {
              expectedUnitPrice: poLine.unitPrice,
              actualUnitPrice: grLine.unitPriceActual,
              currency: po.currency,
            },
          }),
        );
      }

      // Rule 4 — lote-no-conforme. Deferred until GoodsReceiptLine
      // carries a quality-status column; tracked under followup
      // `m3-gr-lot-quality-flag` (see service JSDoc above).
    }

    return out;
  }
}

interface BuildRowInput {
  po: PurchaseOrder;
  gr: GoodsReceipt;
  grLine: GoodsReceiptLine;
  poLine: PurchaseOrderLine;
  discrepancyType: DiscrepancyType;
  diff: Record<string, unknown>;
}

function buildRow(input: BuildRowInput): Reconciliation {
  const r = new Reconciliation();
  r.id = randomUUID();
  r.organizationId = input.gr.organizationId;
  r.poId = input.po.id;
  r.poNumber = input.po.poNumber;
  r.grId = input.gr.id;
  r.supplierId = input.gr.supplierId;
  r.discrepancyType = input.discrepancyType;
  r.diff = input.diff;
  r.state = 'abierta';
  r.resolvedAt = null;
  r.resolvedByUserId = null;
  r.resolutionNotes = null;
  return r;
}
