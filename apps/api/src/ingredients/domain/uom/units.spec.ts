import {
  UNITS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  UNIT_UNITS,
  findUnit,
  listUnitsByFamily,
} from './units';

describe('UoM registry', () => {
  it('contains 13 canonical units (5 WEIGHT + 5 VOLUME + 3 UNIT)', () => {
    expect(WEIGHT_UNITS.length).toBe(5);
    expect(VOLUME_UNITS.length).toBe(5);
    expect(UNIT_UNITS.length).toBe(3);
    expect(UNITS.length).toBe(13);
  });

  it('every unit has a unique code', () => {
    const codes = UNITS.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('findUnit', () => {
  it('returns the matching definition for a known code', () => {
    expect(findUnit('kg')?.family).toBe('WEIGHT');
    expect(findUnit('L')?.family).toBe('VOLUME');
    expect(findUnit('dozen')?.factor).toBe(12);
  });

  it('returns undefined for an unknown code', () => {
    expect(findUnit('xx')).toBeUndefined();
    expect(findUnit('')).toBeUndefined();
  });
});

describe('listUnitsByFamily', () => {
  it('returns only WEIGHT units', () => {
    const w = listUnitsByFamily('WEIGHT');
    expect(w.length).toBe(5);
    expect(w.every((u) => u.family === 'WEIGHT')).toBe(true);
  });

  it('returns only VOLUME units', () => {
    expect(listUnitsByFamily('VOLUME').length).toBe(5);
  });

  it('returns only UNIT units', () => {
    expect(listUnitsByFamily('UNIT').length).toBe(3);
  });
});
