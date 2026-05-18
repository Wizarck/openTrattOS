import { ParseRecipeFromTextService } from './parse-recipe-from-text.service';

describe('ParseRecipeFromTextService — regex stub', () => {
  let service: ParseRecipeFromTextService;

  beforeEach(() => {
    service = new ParseRecipeFromTextService();
  });

  it('parses the j5.md happy-path scenario', () => {
    const out = service.parse('Risotto de setas, 400g champiñones, 200g arroz, 50g parmesano');
    expect(out).not.toBeNull();
    expect(out?.name).toBe('Risotto de setas');
    expect(out?.ingredients).toEqual([
      { name: 'champiñones', quantity: 400, unit: 'g' },
      { name: 'arroz', quantity: 200, unit: 'g' },
      { name: 'parmesano', quantity: 50, unit: 'g' },
    ]);
  });

  it('accepts comma decimal separator and kg units', () => {
    const out = service.parse('Sofrito base, 1,5 kg de tomates, 200g cebolla');
    expect(out?.name).toBe('Sofrito base');
    expect(out?.ingredients).toEqual([
      { name: 'tomates', quantity: 1.5, unit: 'kg' },
      { name: 'cebolla', quantity: 200, unit: 'g' },
    ]);
  });

  it('strips trailing colon from name', () => {
    const out = service.parse('Pan brioche:\n500g harina');
    expect(out?.name).toBe('Pan brioche');
  });

  it('accepts unidades ("ud", "uds") and ml/cl/l units', () => {
    const out = service.parse('Caldo verduras, 2 ud cebolla, 500ml agua, 1 l caldo');
    expect(out?.ingredients).toEqual([
      { name: 'cebolla', quantity: 2, unit: 'ud' },
      { name: 'agua', quantity: 500, unit: 'ml' },
      { name: 'caldo', quantity: 1, unit: 'l' },
    ]);
  });

  it('returns null on empty body', () => {
    expect(service.parse('')).toBeNull();
    expect(service.parse('   ')).toBeNull();
    expect(service.parse(null)).toBeNull();
  });

  it('returns null when first line is itself an ingredient quantity (no name)', () => {
    expect(service.parse('400g champiñones, 200g arroz')).toBeNull();
  });

  it('returns a draft with empty ingredients when no quantity-unit pattern matches (operator hand-fills)', () => {
    const out = service.parse('Crear receta de risotto de calabaza, hablar con Lourdes');
    expect(out).not.toBeNull();
    expect(out?.name).toBe('Crear receta de risotto de calabaza');
    expect(out?.ingredients).toEqual([]);
  });

  it('rejects zero or negative quantities', () => {
    const out = service.parse('Truco, 0g sal');
    // The "0g sal" entry is silently dropped — quantity must be > 0.
    expect(out?.ingredients).toEqual([]);
  });
});
