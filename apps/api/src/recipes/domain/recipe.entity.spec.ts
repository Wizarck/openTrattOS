import { Recipe, RecipeCreateProps } from './recipe.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const validProps = (overrides: Partial<RecipeCreateProps> = {}): RecipeCreateProps => ({
  organizationId: orgId,
  name: 'Tagliatelle Bolognesa',
  description: 'Pasta clásica con ragú de ternera',
  wasteFactor: 0.05,
  ...overrides,
});

describe('Recipe.create', () => {
  it('returns a Recipe with UUID id, props applied, isActive=true', () => {
    const r = Recipe.create(validProps());
    expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(r.organizationId).toBe(orgId);
    expect(r.name).toBe('Tagliatelle Bolognesa');
    expect(r.description).toBe('Pasta clásica con ragú de ternera');
    expect(r.wasteFactor).toBe(0.05);
    expect(r.isActive).toBe(true);
    expect(r.notes).toBeNull();
  });

  it('accepts optional notes', () => {
    const r = Recipe.create(validProps({ notes: 'Use fresh pasta only' }));
    expect(r.notes).toBe('Use fresh pasta only');
  });

  it('rejects empty name', () => {
    expect(() => Recipe.create(validProps({ name: '' }))).toThrow(/name/i);
  });

  it.each([0, 0.0001, 0.5, 0.999])('accepts valid wasteFactor %s', (w) => {
    expect(() => Recipe.create(validProps({ wasteFactor: w }))).not.toThrow();
  });

  it.each([-0.1, 1, 1.5, NaN, Infinity])('rejects invalid wasteFactor %s', (w) => {
    expect(() => Recipe.create(validProps({ wasteFactor: w as number }))).toThrow(/wasteFactor/i);
  });

  it('rejects non-uuid organizationId', () => {
    expect(() => Recipe.create(validProps({ organizationId: 'nope' }))).toThrow(/organizationId|uuid/i);
  });
});

describe('Recipe.applyUpdate', () => {
  it('updates mutable fields (name, description, notes, wasteFactor)', () => {
    const r = Recipe.create(validProps());
    r.applyUpdate({
      name: 'Tagliatelle Boloñesa v2',
      description: 'Updated description',
      notes: 'New notes',
      wasteFactor: 0.08,
    });
    expect(r.name).toBe('Tagliatelle Boloñesa v2');
    expect(r.description).toBe('Updated description');
    expect(r.notes).toBe('New notes');
    expect(r.wasteFactor).toBe(0.08);
  });

  it('refuses to change organizationId (multi-tenant invariant)', () => {
    const r = Recipe.create(validProps());
    expect(() =>
      r.applyUpdate({ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as Parameters<typeof r.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });

  it('rejects invalid wasteFactor on update', () => {
    const r = Recipe.create(validProps());
    expect(() => r.applyUpdate({ wasteFactor: 1.5 })).toThrow(/wasteFactor/i);
  });
});

describe('Recipe.activate / Recipe.deactivate', () => {
  it('toggles isActive (soft-delete pattern)', () => {
    const r = Recipe.create(validProps());
    r.deactivate();
    expect(r.isActive).toBe(false);
    r.activate();
    expect(r.isActive).toBe(true);
  });
});
