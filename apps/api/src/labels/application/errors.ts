export class LabelRecipeNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found for label rendering: ${recipeId}`);
    this.name = 'LabelRecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

export class LabelOrganizationNotFoundError extends Error {
  readonly organizationId: string;
  constructor(organizationId: string) {
    super(`Organization not found for label rendering: ${organizationId}`);
    this.name = 'LabelOrganizationNotFoundError';
    this.organizationId = organizationId;
  }
}

export class UnsupportedLocaleError extends Error {
  readonly locale: string;
  readonly supported: readonly string[];
  constructor(locale: string, supported: readonly string[]) {
    super(`Unsupported locale "${locale}". Supported: ${supported.join(', ')}`);
    this.name = 'UnsupportedLocaleError';
    this.locale = locale;
    this.supported = supported;
  }
}

export class MissingMandatoryFieldsError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Mandatory label fields missing: ${missing.join(', ')}`);
    this.name = 'MissingMandatoryFieldsError';
    this.missing = missing;
  }
}

export class PrintAdapterNotConfiguredError extends Error {
  readonly organizationId: string;
  constructor(organizationId: string) {
    super(`Org ${organizationId} has no printAdapter configured in labelFields`);
    this.name = 'PrintAdapterNotConfiguredError';
    this.organizationId = organizationId;
  }
}

export class PrintAdapterUnknownError extends Error {
  readonly adapterId: string;
  constructor(adapterId: string) {
    super(`No PrintAdapter registered with id "${adapterId}"`);
    this.name = 'PrintAdapterUnknownError';
    this.adapterId = adapterId;
  }
}
