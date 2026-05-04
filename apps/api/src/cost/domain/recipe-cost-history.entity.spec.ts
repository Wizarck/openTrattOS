import { RecipeCostHistory } from './recipe-cost-history.entity';

const recipeId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const componentId = '33333333-3333-4333-8333-333333333333';
const sourceRefId = '44444444-4444-4444-8444-444444444444';

describe('RecipeCostHistory.create', () => {
  it('builds a row with all fields and a generated UUID', () => {
    const h = RecipeCostHistory.create({
      recipeId,
      organizationId: orgId,
      componentRefId: componentId,
      costPerBaseUnit: 0.005,
      totalCost: 2.5,
      sourceRefId,
      reason: 'INITIAL',
    });
    expect(h.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(h.recipeId).toBe(recipeId);
    expect(h.componentRefId).toBe(componentId);
    expect(h.costPerBaseUnit).toBe(0.005);
    expect(h.totalCost).toBe(2.5);
    expect(h.sourceRefId).toBe(sourceRefId);
    expect(h.reason).toBe('INITIAL');
  });

  it('accepts null componentRefId for totals rows', () => {
    const h = RecipeCostHistory.create({
      recipeId,
      organizationId: orgId,
      componentRefId: null,
      costPerBaseUnit: 0,
      totalCost: 12.34,
      sourceRefId: null,
      reason: 'SUPPLIER_PRICE_CHANGE',
    });
    expect(h.componentRefId).toBeNull();
    expect(h.sourceRefId).toBeNull();
  });

  it('rejects negative cost values', () => {
    expect(() =>
      RecipeCostHistory.create({
        recipeId,
        organizationId: orgId,
        componentRefId: null,
        costPerBaseUnit: -1,
        totalCost: 0,
        sourceRefId: null,
        reason: 'INITIAL',
      }),
    ).toThrow(/non-negative/);
    expect(() =>
      RecipeCostHistory.create({
        recipeId,
        organizationId: orgId,
        componentRefId: null,
        costPerBaseUnit: 0,
        totalCost: -1,
        sourceRefId: null,
        reason: 'INITIAL',
      }),
    ).toThrow(/non-negative/);
  });

  it('rejects non-UUID identifiers', () => {
    expect(() =>
      RecipeCostHistory.create({
        recipeId: 'not-a-uuid',
        organizationId: orgId,
        componentRefId: null,
        costPerBaseUnit: 0,
        totalCost: 0,
        sourceRefId: null,
        reason: 'INITIAL',
      }),
    ).toThrow(/recipeId/);
    expect(() =>
      RecipeCostHistory.create({
        recipeId,
        organizationId: 'bad',
        componentRefId: null,
        costPerBaseUnit: 0,
        totalCost: 0,
        sourceRefId: null,
        reason: 'INITIAL',
      }),
    ).toThrow(/organizationId/);
  });
});
