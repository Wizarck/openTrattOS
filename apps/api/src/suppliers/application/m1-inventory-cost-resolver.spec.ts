import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Organization } from '../../iam/domain/organization.entity';
import { Supplier } from '../domain/supplier.entity';
import { SupplierItem } from '../domain/supplier-item.entity';
import { NoCostSourceError } from '../../cost/inventory-cost-resolver';
import { M1InventoryCostResolver } from './m1-inventory-cost-resolver';

const orgId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

function makeIngredient(): Ingredient {
  return Ingredient.create({
    organizationId: orgId,
    categoryId,
    name: 'Tomate',
    baseUnitType: 'WEIGHT',
  });
}

function makeOrg(): Organization {
  return Organization.create({
    name: 'Acme',
    currencyCode: 'EUR',
    defaultLocale: 'es',
    timezone: 'Europe/Madrid',
  });
}

function makeSupplier(): Supplier {
  return Supplier.create({ organizationId: orgId, name: 'Distri Levante', country: 'ES' });
}

function makePreferredItem(supplierId: string, ingredientId: string): SupplierItem {
  const si = SupplierItem.create({
    supplierId,
    ingredientId,
    purchaseUnit: '5 kg Box',
    purchaseUnitQty: 5,
    purchaseUnitType: 'kg',
    unitPrice: 25,
    isPreferred: true,
  });
  si.costPerBaseUnit = 0.005;
  return si;
}

interface MockRepos {
  ingredients: { findOneBy: jest.Mock };
  supplierItems: { findPreferredForIngredient: jest.Mock };
  suppliers: { findOneBy: jest.Mock };
  organizations: { findOneBy: jest.Mock };
}

function build(): { resolver: M1InventoryCostResolver; mocks: MockRepos } {
  const mocks: MockRepos = {
    ingredients: { findOneBy: jest.fn() },
    supplierItems: { findPreferredForIngredient: jest.fn() },
    suppliers: { findOneBy: jest.fn() },
    organizations: { findOneBy: jest.fn() },
  };
  const resolver = new M1InventoryCostResolver(
    mocks.ingredients as unknown as ConstructorParameters<typeof M1InventoryCostResolver>[0],
    mocks.supplierItems as unknown as ConstructorParameters<typeof M1InventoryCostResolver>[1],
    mocks.suppliers as unknown as ConstructorParameters<typeof M1InventoryCostResolver>[2],
    mocks.organizations as unknown as ConstructorParameters<typeof M1InventoryCostResolver>[3],
  );
  return { resolver, mocks };
}

describe('M1InventoryCostResolver', () => {
  it('returns cost + currency + source for a preferred SupplierItem', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makePreferredItem(supplier.id, ingredient.id);

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.costPerBaseUnit).toBe(0.005);
    expect(result.currency).toBe('EUR');
    expect(result.source).toEqual({
      kind: 'supplier-item',
      refId: preferred.id,
      displayLabel: `${supplier.name} — ${preferred.purchaseUnit}`,
    });
  });

  it('throws NoCostSourceError when ingredient is missing', async () => {
    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost('missing')).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('throws NoCostSourceError when no preferred SupplierItem exists', async () => {
    const { resolver, mocks } = build();
    const ingredient = makeIngredient();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost(ingredient.id)).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('throws NoCostSourceError when organization is orphaned (currency lookup fails)', async () => {
    const { resolver, mocks } = build();
    const ingredient = makeIngredient();
    const supplier = makeSupplier();
    const preferred = makePreferredItem(supplier.id, ingredient.id);
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.organizations.findOneBy.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost(ingredient.id)).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('falls back to computeCostPerBaseUnit when costPerBaseUnit is null on the preferred row', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makePreferredItem(supplier.id, ingredient.id);
    preferred.costPerBaseUnit = null; // simulate stale row

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.costPerBaseUnit).toBe(0.005);
  });

  it('uses purchaseUnit alone for the displayLabel when supplier is missing', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makePreferredItem(supplier.id, ingredient.id);

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(null);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.source.displayLabel).toBe(preferred.purchaseUnit);
  });
});
