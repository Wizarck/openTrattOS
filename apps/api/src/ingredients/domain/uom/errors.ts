export class UoMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UoMError';
  }
}

export class UoMUnknownUnitError extends UoMError {
  readonly code: string;
  constructor(code: string) {
    super(`Unknown UoM code: "${code}"`);
    this.name = 'UoMUnknownUnitError';
    this.code = code;
  }
}

export class UoMConversionRequiresDensityError extends UoMError {
  readonly fromUnit: string;
  readonly toUnit: string;
  constructor(fromUnit: string, toUnit: string) {
    super(
      `Conversion ${fromUnit} → ${toUnit} requires a densityFactor (g/ml) — cross-family WEIGHT↔VOLUME is dimension-dependent.`,
    );
    this.name = 'UoMConversionRequiresDensityError';
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}

export class UoMConversionForbiddenError extends UoMError {
  readonly fromUnit: string;
  readonly toUnit: string;
  constructor(fromUnit: string, toUnit: string) {
    super(
      `Conversion ${fromUnit} → ${toUnit} is forbidden — count-based UNIT family cannot convert to/from continuous WEIGHT or VOLUME.`,
    );
    this.name = 'UoMConversionForbiddenError';
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}
