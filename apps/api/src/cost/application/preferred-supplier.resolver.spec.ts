import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Organization } from '../../iam/domain/organization.entity';
import { Supplier } from '../../suppliers/domain/supplier.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import { NoCostSourceError } from '../inventory-cost-resolver';
import { PreferredSupplierResolver } from './preferred-supplier.resolver';

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

function makeSupplier(name = 'Distri Levante'): Supplier {
  return Supplier.create({ organizationId: orgId, name, country: 'ES' });
}

function makeItem(supplierId: string, ingredientId: string, opts: { preferred?: boolean; price?: number } = {}): SupplierItem {
  const si = SupplierItem.create({
    supplierId,
    ingredientId,
    purchaseUnit: '5 kg Box',
    purchaseUnitQty: 5,
    purchaseUnitType: 'kg',
    unitPrice: opts.price ?? 25,
    isPreferred: opts.preferred ?? false,
  });
  si.costPerBaseUnit = (opts.price ?? 25) / 5_000;
  return si;
}

interface MockRepos {
  ingredients: { findOneBy: jest.Mock };
  supplierItems: { findOneBy: jest.Mock; findPreferredForIngredient: jest.Mock };
  suppliers: { findOneBy: jest.Mock };
  organizations: { findOneBy: jest.Mock };
}

function build(): { resolver: PreferredSupplierResolver; mocks: MockRepos } {
  const mocks: MockRepos = {
    ingredients: { findOneBy: jest.fn() },
    supplierItems: { findOneBy: jest.fn(), findPreferredForIngredient: jest.fn() },
    suppliers: { findOneBy: jest.fn() },
    organizations: { findOneBy: jest.fn() },
  };
  const resolver = new PreferredSupplierResolver(
    mocks.ingredients as unknown as ConstructorParameters<typeof PreferredSupplierResolver>[0],
    mocks.supplierItems as unknown as ConstructorParameters<typeof PreferredSupplierResolver>[1],
    mocks.suppliers as unknown as ConstructorParameters<typeof PreferredSupplierResolver>[2],
    mocks.organizations as unknown as ConstructorParameters<typeof PreferredSupplierResolver>[3],
  );
  return { resolver, mocks };
}

describe('PreferredSupplierResolver', () => {
  it('returns cost + currency + source from preferred SupplierItem', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true, price: 25 });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.costPerBaseUnit).toBe(0.005);
    expect(result.currency).toBe('EUR');
    expect(result.source.kind).toBe('supplier-item');
    expect(result.source.refId).toBe(preferred.id);
    expect(result.source.displayLabel).toBe(`${supplier.name} — ${preferred.purchaseUnit}`);
  });

  it('honours sourceOverrideRef when the override is valid for the ingredient', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier('Distri Mar');
    const overrideItem = makeItem(supplier.id, ingredient.id, { price: 40 });
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true, price: 25 });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findOneBy.mockResolvedValue(overrideItem);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id, {
      sourceOverrideRef: overrideItem.id,
    });
    expect(result.costPerBaseUnit).toBe(0.008);
    expect(result.source.refId).toBe(overrideItem.id);
    expect(mocks.supplierItems.findPreferredForIngredient).not.toHaveBeenCalled();
  });

  it('falls back to preferred when sourceOverrideRef points to a different ingredient', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const wrongOverride = makeItem(supplier.id, '99999999-9999-4999-8999-999999999999', { price: 99 });
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true, price: 25 });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findOneBy.mockResolvedValue(wrongOverride);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id, {
      sourceOverrideRef: wrongOverride.id,
    });
    expect(result.source.refId).toBe(preferred.id);
    expect(result.costPerBaseUnit).toBe(0.005);
  });

  it('falls back to preferred when sourceOverrideRef does not exist', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findOneBy.mockResolvedValue(null);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id, { sourceOverrideRef: 'gone' });
    expect(result.source.refId).toBe(preferred.id);
  });

  it('throws NoCostSourceError when no preferred SupplierItem and no usable override', async () => {
    const ingredient = makeIngredient();
    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findOneBy.mockResolvedValue(null);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost(ingredient.id)).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('throws NoCostSourceError when ingredient is missing', async () => {
    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost('missing')).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('throws NoCostSourceError when organization is orphaned', async () => {
    const ingredient = makeIngredient();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.organizations.findOneBy.mockResolvedValue(null);
    await expect(resolver.resolveBaseCost(ingredient.id)).rejects.toBeInstanceOf(NoCostSourceError);
  });

  it('falls back to computeCostPerBaseUnit when costPerBaseUnit is null on the row', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true });
    preferred.costPerBaseUnit = null;

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.costPerBaseUnit).toBe(0.005);
  });

  it('uses purchaseUnit alone as displayLabel when supplier is missing', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(null);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id);
    expect(result.source.displayLabel).toBe(preferred.purchaseUnit);
  });

  it('accepts a legacy Date as the second argument (backward-compat)', async () => {
    const ingredient = makeIngredient();
    const org = makeOrg();
    const supplier = makeSupplier();
    const preferred = makeItem(supplier.id, ingredient.id, { preferred: true });

    const { resolver, mocks } = build();
    mocks.ingredients.findOneBy.mockResolvedValue(ingredient);
    mocks.supplierItems.findPreferredForIngredient.mockResolvedValue(preferred);
    mocks.suppliers.findOneBy.mockResolvedValue(supplier);
    mocks.organizations.findOneBy.mockResolvedValue(org);

    const result = await resolver.resolveBaseCost(ingredient.id, new Date());
    expect(result.costPerBaseUnit).toBe(0.005);
  });
});
