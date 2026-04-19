export interface OrganizationDto {
  id: string;
  name: string;
  /** ISO 4217 currency code — set once, immutable */
  currencyCode: string;
  /** BCP 47 locale — determines UI language and seed translations */
  defaultLocale: 'es' | 'en';
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationDto {
  name: string;
  currencyCode: string;
  defaultLocale: 'es' | 'en';
  timezone: string;
}

export enum LocationType {
  RESTAURANT = 'RESTAURANT',
  BAR = 'BAR',
  DARK_KITCHEN = 'DARK_KITCHEN',
  CATERING = 'CATERING',
  CENTRAL_PRODUCTION = 'CENTRAL_PRODUCTION',
}

export interface LocationDto {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  type: LocationType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
