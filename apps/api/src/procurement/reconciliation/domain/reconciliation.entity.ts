import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Discrepancy categories surfaced on the j11 Reconciliación tab
 * (docs/ux/j11.md §6). Detection ladder:
 *
 *  - `cantidad`        — GR qty_received_actual differs materially from
 *                        PO line quantity_ordered.
 *  - `precio`          — GR unit_price_actual differs materially from
 *                        PO line unit_price.
 *  - `producto`        — GR line product_id does not match the PO line
 *                        ingredient_id (operator scanned the wrong SKU).
 *  - `lote-no-conforme`— GR lot rejected on intake (HACCP / DOP fail).
 *                        Reserved for an upcoming GR enhancement (lot
 *                        quality status not yet on the GoodsReceiptLine
 *                        entity). Spec slot kept to avoid an enum bump.
 */
export type DiscrepancyType =
  | 'cantidad'
  | 'precio'
  | 'producto'
  | 'lote-no-conforme';

export const DISCREPANCY_TYPES: readonly DiscrepancyType[] = [
  'cantidad',
  'precio',
  'producto',
  'lote-no-conforme',
];

/**
 * Reconciliation state machine per j11 §6 resolution actions.
 *
 *  - `abierta`      — created on GR confirm, awaiting operator action.
 *  - `aceptada`     — Owner accepted the diff as-is (audit_log row).
 *  - `nota-credito` — Owner asked supplier for a credit note (audit_log
 *                     row + link to supplier email template).
 *  - `devuelta`     — Owner returned the goods (creates a draft Goods
 *                     Return; reconciliation closes).
 *
 * Forward-only: `abierta` is the only valid source state for a transition,
 * and the three resolution states are terminal.
 */
export type ReconciliationState =
  | 'abierta'
  | 'aceptada'
  | 'nota-credito'
  | 'devuelta';

export const RECONCILIATION_STATES: readonly ReconciliationState[] = [
  'abierta',
  'aceptada',
  'nota-credito',
  'devuelta',
];

/**
 * Structured diff payload persisted as `jsonb`. Per discrepancy type:
 *
 *  - cantidad         → { expectedQty, actualQty, unit }
 *  - precio           → { expectedUnitPrice, actualUnitPrice, currency }
 *  - producto         → { expectedProductId, actualProductId }
 *  - lote-no-conforme → { lotId, reason }
 *
 * We type the column as `Record<string, unknown>` so the application
 * layer (DiscrepancyDetectorService) is the single source of truth on
 * shape per type. Operators read it through the resolution drawer.
 */
export type ReconciliationDiff = Record<string, unknown>;

/**
 * Reconciliation aggregate — one row per (gr_line, discrepancy_type)
 * detected on GR confirmation. Spec: docs/ux/j11.md §6.
 *
 * Per the j11 surface (PR #218 placeholder controller → real now):
 *  - GET /m3/procurement/reconciliation?state=abierta  surfaces the
 *    Owner/Manager working set (default filter on the tab).
 *  - POST /m3/procurement/reconciliation/:id/resolve   moves the row
 *    to one of the three terminal states.
 *
 * Resolution writes a `procurement.resolve-reconciliation` audit_log
 * envelope (slice #21 wiring) AND stamps `resolved_at`,
 * `resolved_by_user_id`, `resolution_notes` here so the j11 list +
 * drawer can render the chip without re-querying audit_log.
 *
 * Multi-tenant invariant enforced at the repository layer; every
 * read/write goes through `ReconciliationRepository` which always
 * WHERE-clauses `organization_id`.
 *
 * `po_id` is NULLABLE so independent (no-PO) GRs that nonetheless
 * surface a discrepancy (e.g., later `lote-no-conforme`) still have a
 * home. Today the detector only emits rows for PO-linked GRs.
 */
@Entity({ name: 'procurement_reconciliations' })
@Index('idx_recon_org_state', ['organizationId', 'state'])
@Index('idx_recon_org_created', ['organizationId', 'createdAt'])
export class Reconciliation {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId: string | null = null;

  /**
   * Denormalised PO number ("PO-2026-0001") so the j11 list view does
   * not need a join to render the column. Stamped at create time;
   * `null` for the (rare) independent-GR case.
   */
  @Column({ name: 'po_number', type: 'text', nullable: true })
  poNumber: string | null = null;

  @Column({ name: 'gr_id', type: 'uuid' })
  grId!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'discrepancy_type', type: 'text' })
  discrepancyType!: DiscrepancyType;

  @Column({ name: 'diff', type: 'jsonb' })
  diff!: ReconciliationDiff;

  @Column({ type: 'text', default: 'abierta' })
  state!: ReconciliationState;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null = null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null = null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
