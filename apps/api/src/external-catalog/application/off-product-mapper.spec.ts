import {
  OFF_LICENSE_ATTRIBUTION,
  mapOffProductToCreateProps,
} from './off-product-mapper';

describe('mapOffProductToCreateProps', () => {
  it('extracts fields from a typical OFF product payload', () => {
    const props = mapOffProductToCreateProps(
      {
        code: '8410173005111',
        product_name: 'Aceite de oliva virgen extra',
        brands: 'Carbonell, AGRO',
        nutriments: { 'energy-kcal_100g': 884, fat_100g: 100 },
        allergens_tags: ['en:gluten', 'en:milk'],
        labels_tags: ['en:vegan', 'en:organic', 'en:fair-trade'],
        last_modified_t: 1735689600,
      },
      'ES',
    );
    expect(props.barcode).toBe('8410173005111');
    expect(props.name).toBe('Aceite de oliva virgen extra');
    expect(props.brand).toBe('Carbonell');
    expect(props.allergens).toEqual(['gluten', 'milk']);
    expect(props.dietFlags).toEqual(['vegan', 'organic']);
    expect(props.dietFlags).not.toContain('fair-trade');
    expect(props.region).toBe('ES');
    expect(props.lastModifiedAt).toEqual(new Date(1735689600 * 1000));
    expect(props.nutrition).toEqual({ 'energy-kcal_100g': 884, fat_100g: 100 });
    expect(props.licenseAttribution).toBe(OFF_LICENSE_ATTRIBUTION);
  });

  it('handles missing optional fields (no brands, no allergens, no labels)', () => {
    const props = mapOffProductToCreateProps(
      { code: '111', product_name: 'Pan' },
      'IT',
    );
    expect(props.brand).toBeNull();
    expect(props.allergens).toEqual([]);
    expect(props.dietFlags).toEqual([]);
    expect(props.lastModifiedAt).toBeNull();
    expect(props.nutrition).toBeNull();
  });

  it('throws on missing barcode (code) or product_name', () => {
    expect(() => mapOffProductToCreateProps({ product_name: 'X' }, 'ES')).toThrow(/barcode/i);
    expect(() => mapOffProductToCreateProps({ code: '123' }, 'ES')).toThrow(/product_name/i);
  });

  it('strips OFF language prefixes from allergen and label tags', () => {
    const props = mapOffProductToCreateProps(
      {
        code: '111',
        product_name: 'Test',
        allergens_tags: ['fr:noix', 'en:gluten', 'plain'],
        labels_tags: ['en:vegetarian'],
      },
      'ES',
    );
    expect(props.allergens).toEqual(['noix', 'gluten', 'plain']);
    expect(props.dietFlags).toEqual(['vegetarian']);
  });

  it('treats invalid last_modified_t (NaN/Infinity) as null', () => {
    const propsNaN = mapOffProductToCreateProps(
      { code: '1', product_name: 'X', last_modified_t: NaN },
      'ES',
    );
    expect(propsNaN.lastModifiedAt).toBeNull();

    const propsInf = mapOffProductToCreateProps(
      { code: '1', product_name: 'X', last_modified_t: Infinity },
      'ES',
    );
    expect(propsInf.lastModifiedAt).toBeNull();
  });
});
