/** The three fundamental families of measurement in a kitchen */
export enum UnitFamily {
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  UNIT = 'UNIT',
}

/** Canonical unit definitions shipped with the system */
export enum WeightUnit {
  KG = 'kg',
  G = 'g',
  MG = 'mg',
  LB = 'lb',
  OZ = 'oz',
}

export enum VolumeUnit {
  L = 'L',
  ML = 'ml',
  CL = 'cl',
  FL_OZ = 'fl_oz',
  GALLON = 'gallon',
}

export enum PieceUnit {
  PCS = 'pcs',
  DOZEN = 'dozen',
  BOX = 'box',
}

/** Union of all possible unit identifiers */
export type AnyUnit = WeightUnit | VolumeUnit | PieceUnit;

/** Maps a unit to its family for validation */
export const UNIT_FAMILY_MAP: Record<AnyUnit, UnitFamily> = {
  // Weight
  [WeightUnit.KG]: UnitFamily.WEIGHT,
  [WeightUnit.G]: UnitFamily.WEIGHT,
  [WeightUnit.MG]: UnitFamily.WEIGHT,
  [WeightUnit.LB]: UnitFamily.WEIGHT,
  [WeightUnit.OZ]: UnitFamily.WEIGHT,
  // Volume
  [VolumeUnit.L]: UnitFamily.VOLUME,
  [VolumeUnit.ML]: UnitFamily.VOLUME,
  [VolumeUnit.CL]: UnitFamily.VOLUME,
  [VolumeUnit.FL_OZ]: UnitFamily.VOLUME,
  [VolumeUnit.GALLON]: UnitFamily.VOLUME,
  // Unit
  [PieceUnit.PCS]: UnitFamily.UNIT,
  [PieceUnit.DOZEN]: UnitFamily.UNIT,
  [PieceUnit.BOX]: UnitFamily.UNIT,
};

/**
 * Conversion factors to the canonical base unit of each family.
 * WEIGHT → grams (g)
 * VOLUME → milliliters (ml)
 * UNIT → pieces (pcs)
 */
export const CONVERSION_TO_BASE: Record<AnyUnit, number> = {
  // Weight → grams
  [WeightUnit.KG]: 1000,
  [WeightUnit.G]: 1,
  [WeightUnit.MG]: 0.001,
  [WeightUnit.LB]: 453.592,
  [WeightUnit.OZ]: 28.3495,
  // Volume → milliliters
  [VolumeUnit.L]: 1000,
  [VolumeUnit.ML]: 1,
  [VolumeUnit.CL]: 10,
  [VolumeUnit.FL_OZ]: 29.5735,
  [VolumeUnit.GALLON]: 3785.41,
  // Unit → pieces
  [PieceUnit.PCS]: 1,
  [PieceUnit.DOZEN]: 12,
  [PieceUnit.BOX]: 1, // Box qty is user-defined per ingredient
};
