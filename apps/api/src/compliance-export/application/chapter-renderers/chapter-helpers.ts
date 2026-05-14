/**
 * Shared CSV / PDF helpers for derivative chapter renderers. Kept tiny
 * + dependency-free so each chapter can compose its own row shape.
 */

export function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvRow(values: ReadonlyArray<string | number | null | undefined>): string {
  return values
    .map((v) =>
      v === null || v === undefined ? '' : csvEscape(String(v)),
    )
    .join(',');
}

export function pdfHeading(title: string): string {
  return `--- ${title} ---`;
}

export function emptyChapter(
  csvTitle: string,
  pdfTitle: string,
  marker: string,
): { csvSection: string; pdfSection: Buffer; rowCount: 0 } {
  const csv = `## ${csvTitle}\n# ${marker}\n`;
  const pdf = `${pdfHeading(pdfTitle)}\n${marker}\n`;
  return {
    csvSection: csv,
    pdfSection: Buffer.from(pdf, 'utf8'),
    rowCount: 0,
  };
}
