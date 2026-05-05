/**
 * Mirrors apps/api/src/menus/interface/dto/menu-item.dto.ts MarginReportDto.
 * Kept locally rather than imported to avoid coupling the kit to backend
 * package layout. When the API contract changes, regenerate via codegen
 * (filed as future work).
 */

export type MarginStatus = 'on_target' | 'below_target' | 'at_risk' | 'unknown';

export interface MarginReport {
  menuItemId: string;
  organizationId: string;
  recipeId: string;
  locationId: string;
  channel: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'CATERING';
  cost: number | null;
  sellingPrice: number;
  targetMargin: number;
  marginAbsolute: number | null;
  marginPercent: number | null;
  marginVsTargetPp: number | null;
  status: MarginStatus;
  statusLabel: string;
  warnings: string[];
  recipeDiscontinued: boolean;
  currency: string;
}

export interface MarginPanelProps {
  /** When `null`, the panel renders the loading skeleton. */
  report: MarginReport | null;
  /** Forces the loading skeleton even when `report` is non-null (e.g. refetch in flight). */
  loading?: boolean;
  /** Locale for currency formatting. Defaults to `en-EU`. */
  locale?: string;
  className?: string;
}
