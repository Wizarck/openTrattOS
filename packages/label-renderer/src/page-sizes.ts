import type { LabelPageSize } from './types';

/**
 * Per-page geometry + typography scaling. `width` and `height` follow
 * `@react-pdf/renderer` conventions (numeric points: 1pt = 1/72 inch).
 *
 * Thermal label dimensions assume the label material is the indicated size;
 * the renderer fills the whole page (margins are tight to maximize content).
 */
export interface PageGeometry {
  /** PDF page size descriptor — passed to `<Page size={...} />`. */
  size: { width: number; height: number };
  /** Outer page padding in points. */
  padding: number;
  /** Body font size in points. Allergen and headings scale relative to this. */
  bodyFontSize: number;
}

const PT_PER_INCH = 72;
const PT_PER_MM = PT_PER_INCH / 25.4;

export const PAGE_GEOMETRY: Record<LabelPageSize, PageGeometry> = {
  a4: {
    size: { width: 595.28, height: 841.89 }, // A4 in points
    padding: 36,
    bodyFontSize: 10,
  },
  'thermal-4x6': {
    size: { width: 4 * PT_PER_INCH, height: 6 * PT_PER_INCH }, // 288 × 432 pt
    padding: 8,
    bodyFontSize: 7,
  },
  'thermal-50x80': {
    size: { width: 50 * PT_PER_MM, height: 80 * PT_PER_MM }, // ~141.7 × 226.8 pt
    padding: 4,
    bodyFontSize: 6,
  },
};
