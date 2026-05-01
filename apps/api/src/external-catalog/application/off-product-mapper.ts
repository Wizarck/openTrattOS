import { ExternalFoodCatalogCreateProps } from '../domain/external-food-catalog.entity';
import { OffProduct } from './off-api.types';

/**
 * ODbL attribution text required by Open Food Facts (per ADR-015 §Compliance).
 * Persisted on every row so downstream UI consumers (#5 m2-ingredients-extension)
 * can render it inline.
 */
export const OFF_LICENSE_ATTRIBUTION =
  'Source: Open Food Facts (https://world.openfoodfacts.org), licensed under ODbL v1.0';

/**
 * Diet-flag tags emitted by OFF that we surface verbatim. The list is
 * deliberately narrow; the full `labels_tags` set carries hundreds of
 * non-dietary entries (organic, fair-trade, etc.) which we ignore here.
 */
const DIET_FLAG_TAGS = new Set<string>([
  'en:vegan',
  'en:vegetarian',
  'en:gluten-free',
  'en:lactose-free',
  'en:halal',
  'en:kosher',
  'en:organic',
  'en:no-added-sugar',
  'en:no-preservatives',
]);

/**
 * Map an OFF product payload to the entity create props. Throws if the
 * minimum-required fields (`code`, `product_name`) are missing or blank.
 */
export function mapOffProductToCreateProps(
  product: OffProduct,
  region: string,
): ExternalFoodCatalogCreateProps {
  const barcode = (product.code ?? '').trim();
  const name = (product.product_name ?? '').trim();
  if (barcode.length === 0) {
    throw new Error('OFF product missing barcode (code)');
  }
  if (name.length === 0) {
    throw new Error(`OFF product "${barcode}" missing product_name`);
  }

  // OFF returns brands as a comma-separated string. Take the first; surface
  // the rest only if a downstream feature ever asks for them.
  const brand = extractFirstBrand(product.brands);

  const allergens = Array.isArray(product.allergens_tags)
    ? product.allergens_tags.map((t) => stripLanguagePrefix(t)).filter((t) => t.length > 0)
    : [];

  const dietFlags = Array.isArray(product.labels_tags)
    ? product.labels_tags
        .filter((t) => DIET_FLAG_TAGS.has(t))
        .map((t) => stripLanguagePrefix(t))
        .filter((t) => t.length > 0)
    : [];

  const lastModifiedAt =
    typeof product.last_modified_t === 'number' && Number.isFinite(product.last_modified_t)
      ? new Date(product.last_modified_t * 1000)
      : null;

  return {
    barcode,
    name,
    brand,
    nutrition: product.nutriments ?? null,
    allergens,
    dietFlags,
    region,
    lastModifiedAt,
    licenseAttribution: OFF_LICENSE_ATTRIBUTION,
  };
}

function extractFirstBrand(raw: string | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim() ?? '';
  return first.length === 0 ? null : first;
}

function stripLanguagePrefix(tag: string): string {
  // OFF prefixes tags with a language code, e.g. "en:gluten" — strip it for
  // language-neutral storage. Tags without a prefix pass through unchanged.
  const colon = tag.indexOf(':');
  return colon >= 0 ? tag.slice(colon + 1) : tag;
}
