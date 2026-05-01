import {
  UoMConversionForbiddenError,
  UoMConversionRequiresDensityError,
  UoMUnknownUnitError,
} from './errors';
import { findUnit } from './units';

/**
 * Convert `value` from `fromUnit` to `toUnit`. Pure function (D5 / D13).
 *
 * Rules:
 *   - Same family WEIGHT↔WEIGHT, VOLUME↔VOLUME, UNIT↔UNIT: deterministic via base-unit factors.
 *   - WEIGHT ↔ VOLUME: requires positive `densityFactor` in g/ml.
 *   - WEIGHT ↔ UNIT or VOLUME ↔ UNIT: forbidden (count is dimensionless).
 *
 * Throws:
 *   - UoMUnknownUnitError if either code is not registered.
 *   - UoMConversionRequiresDensityError on cross-family WEIGHT↔VOLUME without density.
 *   - UoMConversionForbiddenError on UNIT ↔ continuous-family attempts.
 *   - Error if value is not finite, or density is non-positive.
 */
export function convert(
  value: number,
  fromUnit: string,
  toUnit: string,
  densityFactor?: number,
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`UoM convert: value must be a finite number; got ${value}`);
  }

  const from = findUnit(fromUnit);
  if (!from) throw new UoMUnknownUnitError(fromUnit);
  const to = findUnit(toUnit);
  if (!to) throw new UoMUnknownUnitError(toUnit);

  if (from.code === to.code) {
    return value;
  }

  // Same family: linear via base-unit factors.
  if (from.family === to.family) {
    return (value * from.factor) / to.factor;
  }

  // Cross-family involving UNIT: forbidden.
  if (from.family === 'UNIT' || to.family === 'UNIT') {
    throw new UoMConversionForbiddenError(fromUnit, toUnit);
  }

  // WEIGHT ↔ VOLUME requires density (g/ml).
  if (densityFactor === undefined) {
    throw new UoMConversionRequiresDensityError(fromUnit, toUnit);
  }
  if (!Number.isFinite(densityFactor) || densityFactor <= 0) {
    throw new Error(`UoM convert: densityFactor must be a positive finite number; got ${densityFactor}`);
  }

  // Convert source to its base, then bridge via density to the target's base, then to target unit.
  const valueInFromBase = value * from.factor; // grams (if WEIGHT) or millilitres (if VOLUME)
  if (from.family === 'WEIGHT' && to.family === 'VOLUME') {
    // grams → ml: ml = g / density
    const valueInMl = valueInFromBase / densityFactor;
    return valueInMl / to.factor;
  }
  if (from.family === 'VOLUME' && to.family === 'WEIGHT') {
    // ml → grams: g = ml * density
    const valueInGrams = valueInFromBase * densityFactor;
    return valueInGrams / to.factor;
  }

  /* istanbul ignore next — exhaustiveness guard; should not reach with current families. */
  throw new UoMConversionForbiddenError(fromUnit, toUnit);
}
