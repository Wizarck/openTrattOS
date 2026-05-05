import { applyIronRule } from './types';

describe('applyIronRule (FR19 server-side guard)', () => {
  it('passes a complete suggestion through unchanged', () => {
    const result = applyIronRule({
      value: 0.85,
      citationUrl: 'https://example.com/cited',
      snippet: 'Pelar la cebolla y descartar las capas externas (~15% pérdida)',
    });
    expect(result).toEqual({
      value: 0.85,
      citationUrl: 'https://example.com/cited',
      snippet: 'Pelar la cebolla y descartar las capas externas (~15% pérdida)',
    });
  });

  it('returns null when input is null', () => {
    expect(applyIronRule(null)).toBeNull();
  });

  it('returns null on empty citationUrl', () => {
    expect(
      applyIronRule({ value: 0.5, citationUrl: '', snippet: 'snippet' }),
    ).toBeNull();
  });

  it('returns null on whitespace-only citationUrl', () => {
    expect(
      applyIronRule({ value: 0.5, citationUrl: '   ', snippet: 'snippet' }),
    ).toBeNull();
  });

  it('returns null on empty snippet', () => {
    expect(
      applyIronRule({ value: 0.5, citationUrl: 'https://x', snippet: '' }),
    ).toBeNull();
  });

  it('returns null on whitespace-only snippet', () => {
    expect(
      applyIronRule({ value: 0.5, citationUrl: 'https://x', snippet: '   ' }),
    ).toBeNull();
  });

  it('returns null when value is NaN', () => {
    expect(
      applyIronRule({
        value: Number.NaN,
        citationUrl: 'https://x',
        snippet: 'snippet',
      }),
    ).toBeNull();
  });

  it('returns null when value is below 0', () => {
    expect(
      applyIronRule({ value: -0.1, citationUrl: 'https://x', snippet: 'snippet' }),
    ).toBeNull();
  });

  it('returns null when value is above 1', () => {
    expect(
      applyIronRule({ value: 1.5, citationUrl: 'https://x', snippet: 'snippet' }),
    ).toBeNull();
  });

  it('truncates snippet to 500 chars with ellipsis marker', () => {
    const long = 'x'.repeat(800);
    const result = applyIronRule({
      value: 0.5,
      citationUrl: 'https://x',
      snippet: long,
    });
    expect(result).not.toBeNull();
    expect(result!.snippet.length).toBe(500);
    expect(result!.snippet.endsWith('…')).toBe(true);
    expect(result!.snippet.startsWith('xx')).toBe(true);
  });

  it('preserves snippet exactly at 500 chars (no truncation)', () => {
    const exact = 'y'.repeat(500);
    const result = applyIronRule({
      value: 0.5,
      citationUrl: 'https://x',
      snippet: exact,
    });
    expect(result!.snippet).toBe(exact);
    expect(result!.snippet.length).toBe(500);
  });

  it('trims citationUrl whitespace', () => {
    const result = applyIronRule({
      value: 0.5,
      citationUrl: '  https://example.com  ',
      snippet: 'snippet',
    });
    expect(result!.citationUrl).toBe('https://example.com');
  });
});
