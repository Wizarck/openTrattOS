import { GoodsReceipt } from '../../gr/domain/goods-receipt.entity';
import { GoodsReceiptLine } from '../../gr/domain/goods-receipt-line.entity';
import { PurchaseOrder } from '../../po/domain/purchase-order.entity';
import { PurchaseOrderLine } from '../../po/domain/purchase-order-line.entity';
import { DiscrepancyDetectorService } from './discrepancy-detector.service';

/**
 * Unit tests for the pure-domain DiscrepancyDetectorService. The
 * detector takes plain entity instances + returns plain entities; no
 * repo, no transaction. Covers every detection rule + the
 * no-discrepancy case + the independent-GR skip.
 */
describe('DiscrepancyDetectorService (unit)', () => {
  // Fixed valid v4 UUIDs (variant 8/9/a/b in the 17th hex char).
  const ORG_ID = '11111111-1111-4111-8111-111111111111';
  const SUPPLIER_ID = '22222222-2222-4222-9222-222222222222';
  const LOCATION_ID = '33333333-3333-4333-a333-333333333333';
  const USER_ID = '44444444-4444-4444-b444-444444444444';
  const INGREDIENT_A = '55555555-5555-4555-8555-555555555555';
  const INGREDIENT_B = '66666666-6666-4666-9666-666666666666';
  const PO_ID = '77777777-7777-4777-a777-777777777777';
  const PO_LINE_ID = '88888888-8888-4888-b888-888888888888';
  const GR_ID = '99999999-9999-4999-8999-999999999999';
  const GR_LINE_ID = 'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa';

  let detector: DiscrepancyDetectorService;

  beforeEach(() => {
    detector = new DiscrepancyDetectorService();
  });

  function makePo(): PurchaseOrder {
    const po = new PurchaseOrder();
    po.id = PO_ID;
    po.organizationId = ORG_ID;
    po.supplierId = SUPPLIER_ID;
    po.poNumber = 'PO-2026-0001';
    po.state = 'sent';
    po.currency = 'EUR';
    po.subtotal = 100;
    po.vatTotal = 21;
    po.total = 121;
    po.expectedDeliveryDate = null;
    po.notes = null;
    po.createdByUserId = USER_ID;
    po.sentAt = new Date('2026-05-15T10:00:00Z');
    po.closedAt = null;
    po.createdAt = new Date('2026-05-15T09:00:00Z');
    po.updatedAt = new Date('2026-05-15T10:00:00Z');
    return po;
  }

  function makePoLine(overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
    const line = new PurchaseOrderLine();
    line.id = PO_LINE_ID;
    line.purchaseOrderId = PO_ID;
    line.organizationId = ORG_ID;
    line.lineNumber = 1;
    line.ingredientId = INGREDIENT_A;
    line.quantityOrdered = 10;
    line.unit = 'kg';
    line.unitPrice = 5;
    line.vatRate = 0.21;
    line.vatInclusive = false;
    line.lineSubtotal = 50;
    line.lineVat = 10.5;
    line.lineTotal = 60.5;
    return Object.assign(line, overrides);
  }

  function makeGr(): GoodsReceipt {
    const gr = new GoodsReceipt();
    gr.id = GR_ID;
    gr.organizationId = ORG_ID;
    gr.poId = PO_ID;
    gr.supplierId = SUPPLIER_ID;
    gr.receivedAt = new Date('2026-05-16T11:00:00Z');
    gr.receivedAtLocationId = LOCATION_ID;
    gr.receivingUserId = USER_ID;
    gr.supplierInvoiceRef = 'INV-A-123';
    gr.state = 'confirmed';
    gr.sourcePhotoIngestionId = null;
    gr.requiresReview = false;
    gr.createdAt = new Date('2026-05-16T11:00:00Z');
    gr.updatedAt = new Date('2026-05-16T11:00:00Z');
    return gr;
  }

  function makeGrLine(overrides: Partial<GoodsReceiptLine> = {}): GoodsReceiptLine {
    const line = new GoodsReceiptLine();
    line.id = GR_LINE_ID;
    line.grId = GR_ID;
    line.poLineId = PO_LINE_ID;
    line.productId = INGREDIENT_A;
    line.qtyReceivedActual = 10;
    line.unitPriceActual = 5;
    line.lotIdCreated = null;
    line.expiresAtOverride = null;
    line.createdAt = new Date('2026-05-16T11:00:00Z');
    line.updatedAt = new Date('2026-05-16T11:00:00Z');
    return Object.assign(line, overrides);
  }

  it('emits NO rows when GR matches PO exactly', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine()],
      gr: makeGr(),
      grLines: [makeGrLine()],
    });
    expect(result).toEqual([]);
  });

  it('emits a cantidad row when qty differs', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine({ quantityOrdered: 10 })],
      gr: makeGr(),
      grLines: [makeGrLine({ qtyReceivedActual: 8 })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].discrepancyType).toBe('cantidad');
    expect(result[0].state).toBe('abierta');
    expect(result[0].diff).toEqual({
      expectedQty: 10,
      actualQty: 8,
      unit: 'kg',
    });
    // Denormalised columns populated for j11 list view.
    expect(result[0].poId).toBe(PO_ID);
    expect(result[0].poNumber).toBe('PO-2026-0001');
    expect(result[0].grId).toBe(GR_ID);
    expect(result[0].organizationId).toBe(ORG_ID);
  });

  it('emits a producto row when SKU differs', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine({ ingredientId: INGREDIENT_A })],
      gr: makeGr(),
      grLines: [makeGrLine({ productId: INGREDIENT_B })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].discrepancyType).toBe('producto');
    expect(result[0].diff).toEqual({
      expectedProductId: INGREDIENT_A,
      actualProductId: INGREDIENT_B,
    });
  });

  it('emits a precio row when unit price differs (carries currency from PO)', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine({ unitPrice: 5 })],
      gr: makeGr(),
      grLines: [makeGrLine({ unitPriceActual: 5.5 })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].discrepancyType).toBe('precio');
    expect(result[0].diff).toEqual({
      expectedUnitPrice: 5,
      actualUnitPrice: 5.5,
      currency: 'EUR',
    });
  });

  it('emits multiple rows (cantidad + precio) for a single line that diverges on both axes', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine({ quantityOrdered: 10, unitPrice: 5 })],
      gr: makeGr(),
      grLines: [makeGrLine({ qtyReceivedActual: 8, unitPriceActual: 6 })],
    });
    expect(result).toHaveLength(2);
    const types = result.map((r) => r.discrepancyType).sort();
    expect(types).toEqual(['cantidad', 'precio']);
  });

  it('SKIPS GR lines without po_line_id (independent GR — detector emits nothing)', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine()],
      gr: makeGr(),
      grLines: [makeGrLine({ poLineId: null, qtyReceivedActual: 999 })],
    });
    expect(result).toEqual([]);
  });

  it('ignores sub-epsilon numeric noise (qty + price both within 1e-6)', () => {
    const result = detector.detect({
      po: makePo(),
      poLines: [makePoLine({ quantityOrdered: 10, unitPrice: 5 })],
      gr: makeGr(),
      grLines: [
        makeGrLine({ qtyReceivedActual: 10 + 1e-7, unitPriceActual: 5 - 1e-7 }),
      ],
    });
    expect(result).toEqual([]);
  });
});
