import { convert } from './convert';
import {
  UoMConversionForbiddenError,
  UoMConversionRequiresDensityError,
  UoMUnknownUnitError,
} from './errors';

const closeTo = (a: number, b: number, dp = 8) => {
  expect(a).toBeCloseTo(b, dp);
};

describe('convert — within WEIGHT', () => {
  it('1 kg = 1000 g', () => closeTo(convert(1, 'kg', 'g'), 1000));
  it('500 g = 0.5 kg', () => closeTo(convert(500, 'g', 'kg'), 0.5));
  it('1 g = 1000 mg', () => closeTo(convert(1, 'g', 'mg'), 1000));
  it('1 lb ≈ 16 oz', () => closeTo(convert(1, 'lb', 'oz'), 16, 6));
  it('1 kg ≈ 2.20462262 lb', () => closeTo(convert(1, 'kg', 'lb'), 2.20462262, 6));
  it('round-trip: 2.5 lb → g → lb', () => closeTo(convert(convert(2.5, 'lb', 'g'), 'g', 'lb'), 2.5));
});

describe('convert — within VOLUME', () => {
  it('1 L = 1000 ml', () => closeTo(convert(1, 'L', 'ml'), 1000));
  it('250 ml = 25 cl', () => closeTo(convert(250, 'ml', 'cl'), 25));
  it('1 fl_oz ≈ 29.5735296 ml', () => closeTo(convert(1, 'fl_oz', 'ml'), 29.5735295625, 6));
  it('1 gallon ≈ 128 fl_oz', () => closeTo(convert(1, 'gallon', 'fl_oz'), 128, 4));
});

describe('convert — within UNIT', () => {
  it('1 dozen = 12 pcs', () => closeTo(convert(1, 'dozen', 'pcs'), 12));
  it('24 pcs = 2 dozen', () => closeTo(convert(24, 'pcs', 'dozen'), 2));
  it('box defaults to 1 pcs (SupplierItem-level qty overrides separately)', () =>
    closeTo(convert(3, 'box', 'pcs'), 3));
});

describe('convert — cross-family WEIGHT ↔ VOLUME with density', () => {
  it('1 L of water (density 1 g/ml) = 1000 g', () => closeTo(convert(1, 'L', 'g', 1), 1000));
  it('1 L of olive oil (density 0.92 g/ml) = 920 g', () => closeTo(convert(1, 'L', 'g', 0.92), 920));
  it('500 g of water → ml at density 1', () => closeTo(convert(500, 'g', 'ml', 1), 500));
  it('throws UoMConversionRequiresDensityError without densityFactor', () => {
    expect(() => convert(1, 'L', 'g')).toThrow(UoMConversionRequiresDensityError);
    expect(() => convert(500, 'g', 'ml')).toThrow(UoMConversionRequiresDensityError);
  });
  it('rejects non-positive density', () => {
    expect(() => convert(1, 'L', 'g', 0)).toThrow(/density/i);
    expect(() => convert(1, 'L', 'g', -0.5)).toThrow(/density/i);
  });
});

describe('convert — cross-family forbidden (UNIT ↔ continuous)', () => {
  it.each([
    ['kg', 'pcs'],
    ['pcs', 'kg'],
    ['L', 'pcs'],
    ['pcs', 'L'],
    ['g', 'dozen'],
    ['box', 'mg'],
    ['fl_oz', 'pcs'],
  ])('throws UoMConversionForbiddenError for %s ↔ %s', (a, b) => {
    expect(() => convert(1, a, b)).toThrow(UoMConversionForbiddenError);
  });
});

describe('convert — same-unit identity', () => {
  it.each(['kg', 'L', 'pcs', 'lb', 'fl_oz'])('returns the same value when from === to (%s)', (u) => {
    closeTo(convert(7.5, u, u), 7.5);
  });
});

describe('convert — unknown units', () => {
  it.each([
    ['xx', 'kg'],
    ['kg', 'XX'],
    ['', 'g'],
  ])('throws UoMUnknownUnitError for from=%s to=%s', (a, b) => {
    expect(() => convert(1, a, b)).toThrow(UoMUnknownUnitError);
  });
});

describe('convert — invalid input value', () => {
  it.each([NaN, Infinity, -Infinity])('rejects %s', (v) => {
    expect(() => convert(v as number, 'kg', 'g')).toThrow(/value|finite/i);
  });
  it('accepts negative values (refunds, deltas)', () => closeTo(convert(-1, 'kg', 'g'), -1000));
  it('accepts zero', () => closeTo(convert(0, 'kg', 'g'), 0));
});
