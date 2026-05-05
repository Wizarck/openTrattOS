/**
 * Mirrors apps/api/src/dashboard/interface/dto/dashboard.dto.ts (subset).
 * Hand-mirrored per #12 + #13 retro tech-debt note (codegen pipeline filed).
 */

import type { MarginReport } from '../MarginPanel';

export interface DashboardMenuItem {
  menuItemId: string;
  recipeId: string;
  locationId: string;
  channel: string;
  displayLabel: string;
  margin: MarginReport;
}

export interface MenuItemRankerProps {
  /** Top-N items (e.g. top-5 by margin descending). Empty when not yet loaded. */
  top: DashboardMenuItem[];
  /** Bottom-N items (e.g. bottom-5 by margin ascending). Empty when not yet loaded. */
  bottom: DashboardMenuItem[];
  loading?: boolean;
  /** Empty-state copy when both top and bottom are []. */
  emptyStateCopy?: string;
  /** Currency formatting locale. Defaults to en-EU. */
  locale?: string;
  /** When provided, renders a "View details" affordance on each card; the consumer handles routing. */
  onViewDetails?: (item: DashboardMenuItem) => void;
  className?: string;
}
