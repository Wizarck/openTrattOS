import { Category, CategoryCreateProps } from './category.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const validProps = (overrides: Partial<CategoryCreateProps> = {}): CategoryCreateProps => ({
  organizationId: orgId,
  parentId: null,
  name: 'meat',
  nameEs: 'Carnes',
  nameEn: 'Meat',
  sortOrder: 100,
  ...overrides,
});

describe('Category.create', () => {
  it('returns a Category with UUID id, the given props, and isDefault=false', () => {
    const cat = Category.create(validProps());
    expect(cat.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(cat.organizationId).toBe(orgId);
    expect(cat.parentId).toBeNull();
    expect(cat.name).toBe('meat');
    expect(cat.nameEs).toBe('Carnes');
    expect(cat.nameEn).toBe('Meat');
    expect(cat.sortOrder).toBe(100);
    expect(cat.isDefault).toBe(false);
  });

  it('defaults sortOrder to 0 when not provided', () => {
    const props = validProps();
    delete (props as Partial<CategoryCreateProps>).sortOrder;
    const cat = Category.create(props as CategoryCreateProps);
    expect(cat.sortOrder).toBe(0);
  });

  it.each(['', '   ', null, undefined])('rejects empty/blank name "%s"', (name) => {
    expect(() => Category.create(validProps({ name: name as string }))).toThrow(/name/i);
  });

  it('rejects empty nameEs', () => {
    expect(() => Category.create(validProps({ nameEs: '' }))).toThrow(/nameEs/i);
  });

  it('rejects empty nameEn', () => {
    expect(() => Category.create(validProps({ nameEn: '' }))).toThrow(/nameEn/i);
  });

  it('accepts a parentId UUID', () => {
    const parentId = '22222222-2222-4222-8222-222222222222';
    const cat = Category.create(validProps({ parentId }));
    expect(cat.parentId).toBe(parentId);
  });

  it('rejects non-uuid parentId', () => {
    expect(() => Category.create(validProps({ parentId: 'not-a-uuid' }))).toThrow(/parentId|uuid/i);
  });

  it('rejects non-uuid organizationId', () => {
    expect(() => Category.create(validProps({ organizationId: 'nope' }))).toThrow(/organizationId|uuid/i);
  });

  it('rejects negative sortOrder', () => {
    expect(() => Category.create(validProps({ sortOrder: -1 }))).toThrow(/sortOrder/i);
  });
});

describe('Category.createSeedDefault (factory used by §6 seed)', () => {
  it('marks isDefault=true', () => {
    const cat = Category.createSeedDefault(validProps());
    expect(cat.isDefault).toBe(true);
  });
});

describe('Category.applyUpdate', () => {
  it('updates mutable fields', () => {
    const cat = Category.create(validProps());
    cat.applyUpdate({
      name: 'pescado',
      nameEs: 'Pescados',
      nameEn: 'Fish',
      sortOrder: 200,
    });
    expect(cat.name).toBe('pescado');
    expect(cat.nameEs).toBe('Pescados');
    expect(cat.nameEn).toBe('Fish');
    expect(cat.sortOrder).toBe(200);
  });

  it('refuses to change organizationId (multi-tenant invariant)', () => {
    const cat = Category.create(validProps());
    expect(() =>
      cat.applyUpdate({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      } as Parameters<typeof cat.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });

  it('allows reparenting (parentId change) but rejects self-parent', () => {
    const cat = Category.create(validProps());
    const newParent = '33333333-3333-4333-8333-333333333333';
    cat.applyUpdate({ parentId: newParent });
    expect(cat.parentId).toBe(newParent);

    expect(() => cat.applyUpdate({ parentId: cat.id })).toThrow(/self|parent/i);
  });

  it('refuses to flip isDefault (seed-only invariant)', () => {
    const cat = Category.createSeedDefault(validProps());
    expect(() =>
      cat.applyUpdate({ isDefault: false } as Parameters<typeof cat.applyUpdate>[0]),
    ).toThrow(/isDefault|seed/i);
  });
});
