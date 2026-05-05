import * as React from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';
import { LabelDocument } from './components/LabelDocument';
import type { LabelData } from './types';

/**
 * Renders a `LabelData` to a PDF Buffer using `@react-pdf/renderer`. Server-
 * side only — `@react-pdf/renderer` ships separate node and browser builds;
 * this module imports the node build via the package's main entry.
 *
 * Pre-launch external legal review per ADR-019 §Risk gates production
 * exposure of this output via `OPENTRATTOS_LABELS_PROD_ENABLED`.
 */
export async function renderLabelToPdf(data: LabelData): Promise<Buffer> {
  // LabelDocument always returns a <Document>; cast to satisfy renderToBuffer's
  // ReactElement<DocumentProps> signature (TS can't see through the wrapper).
  const element = React.createElement(LabelDocument, { data }) as unknown as React.ReactElement<DocumentProps>;
  return renderToBuffer(element);
}
