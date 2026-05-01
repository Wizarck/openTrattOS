/**
 * Shape of the Open Food Facts product payload we consume. The full OFF
 * response is much wider (hundreds of fields); we only extract the subset
 * needed to populate `external_food_catalog`. The rest of `nutriments` is
 * persisted as jsonb so OFF schema drift does not require a migration.
 */
export interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  allergens_tags?: string[];
  labels_tags?: string[];
  last_modified_t?: number;
}

export interface OffProductResponse {
  status: 0 | 1;
  status_verbose?: string;
  code?: string;
  product?: OffProduct;
}

export interface OffSearchResponse {
  count?: number;
  page_size?: number;
  page?: number;
  products?: OffProduct[];
}

/**
 * Fetch function dependency injected so unit tests can mock it without
 * patching globals. Mirrors the WHATWG fetch signature.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class OffApiOutageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OffApiOutageError';
  }
}

export class OffApiNotFoundError extends Error {
  readonly barcode: string;
  constructor(barcode: string) {
    super(`OFF API returned no product for barcode "${barcode}"`);
    this.name = 'OffApiNotFoundError';
    this.barcode = barcode;
  }
}

export class OffSyncInProgressError extends Error {
  constructor() {
    super('An OFF sync is already in progress; refusing to start a second one');
    this.name = 'OffSyncInProgressError';
  }
}
