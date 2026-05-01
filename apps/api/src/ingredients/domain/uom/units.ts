/**
 * Canonical Unit-of-Measure registry. Per design.md §D13, UoM is data + pure
 * functions, not a database entity. The factors below are conversion ratios
 * to the family's base unit:
 *
 *   WEIGHT base = gram (g)        → 1 kg = 1000 g, 1 lb = 453.59237 g
 *   VOLUME base = millilitre (ml) → 1 L = 1000 ml, 1 fl oz = 29.5735296875 ml
 *   UNIT family is dimensionless; baseQuantity = how many "pcs" the unit represents.
 *
 * Adding a new unit: append to the `UNITS` table and ensure `factor`
 * (or `baseQuantity` for UNIT family) is exact (avoid lossy float conversions
 * for the canonical multipliers — prefer rational decimals).
 */

export type UoMFamily = 'WEIGHT' | 'VOLUME' | 'UNIT';

export interface UoMDefinition {
  /** Canonical short code; case-sensitive. */
  readonly code: string;
  /** Human-readable label (English, locale-free). */
  readonly label: string;
  /** Family. Cross-family conversions follow the rules in `convert.ts`. */
  readonly family: UoMFamily;
  /**
   * Conversion factor to the family's base unit (g for WEIGHT, ml for VOLUME).
   * For UNIT family, this is the number of "pcs" the unit represents
   * (1 dozen = 12 pcs, 1 box = N pcs where N is unit-config-defined; default 1).
   */
  readonly factor: number;
}

export const WEIGHT_UNITS: readonly UoMDefinition[] = [
  { code: 'kg', label: 'kilogram', family: 'WEIGHT', factor: 1000 },
  { code: 'g', label: 'gram', family: 'WEIGHT', factor: 1 },
  { code: 'mg', label: 'milligram', family: 'WEIGHT', factor: 0.001 },
  { code: 'lb', label: 'pound', family: 'WEIGHT', factor: 453.59237 },
  { code: 'oz', label: 'ounce', family: 'WEIGHT', factor: 28.349523125 },
] as const;

export const VOLUME_UNITS: readonly UoMDefinition[] = [
  { code: 'L', label: 'litre', family: 'VOLUME', factor: 1000 },
  { code: 'ml', label: 'millilitre', family: 'VOLUME', factor: 1 },
  { code: 'cl', label: 'centilitre', family: 'VOLUME', factor: 10 },
  { code: 'fl_oz', label: 'fluid ounce (US)', family: 'VOLUME', factor: 29.5735295625 },
  { code: 'gallon', label: 'gallon (US liquid)', family: 'VOLUME', factor: 3785.411784 },
] as const;

export const UNIT_UNITS: readonly UoMDefinition[] = [
  { code: 'pcs', label: 'piece', family: 'UNIT', factor: 1 },
  { code: 'dozen', label: 'dozen', family: 'UNIT', factor: 12 },
  { code: 'box', label: 'box (default 1 pcs; SupplierItem may override)', family: 'UNIT', factor: 1 },
] as const;

export const UNITS: readonly UoMDefinition[] = [...WEIGHT_UNITS, ...VOLUME_UNITS, ...UNIT_UNITS];

const UNITS_BY_CODE: ReadonlyMap<string, UoMDefinition> = new Map(UNITS.map((u) => [u.code, u]));

export function findUnit(code: string): UoMDefinition | undefined {
  return UNITS_BY_CODE.get(code);
}

export function listUnitsByFamily(family: UoMFamily): readonly UoMDefinition[] {
  return UNITS.filter((u) => u.family === family);
}
