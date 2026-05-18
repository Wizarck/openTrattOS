import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __DRAFT_KEY_PREFIX,
  __DRAFT_TTL_MS,
  clearDraft,
  listDrafts,
  loadDraft,
  loadDraftSavedAt,
  saveDraft,
} from './draftStorage';

function clearAllDrafts() {
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(__DRAFT_KEY_PREFIX)) keysToDelete.push(k);
  }
  for (const k of keysToDelete) localStorage.removeItem(k);
}

beforeEach(() => {
  clearAllDrafts();
});
afterEach(() => {
  clearAllDrafts();
  vi.useRealTimers();
});

describe('draftStorage', () => {
  it('saveDraft + loadDraft round-trips an arbitrary JSON value', () => {
    saveDraft('recon:abc', { notes: 'Devolución parcial — verificar lote' });
    expect(loadDraft('recon:abc')).toEqual({
      notes: 'Devolución parcial — verificar lote',
    });
  });

  it('returns null when the key has never been written', () => {
    expect(loadDraft('recon:never')).toBeNull();
  });

  it('clearDraft removes the entry', () => {
    saveDraft('recon:x', 'hola');
    expect(loadDraft('recon:x')).toBe('hola');
    clearDraft('recon:x');
    expect(loadDraft('recon:x')).toBeNull();
  });

  it('expires entries older than the 24h TTL on read', () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow);
    saveDraft('recon:old', 'stale');
    // Advance past 24h.
    vi.setSystemTime(realNow + __DRAFT_TTL_MS + 60_000);
    expect(loadDraft('recon:old')).toBeNull();
    // And the underlying key was removed on the failed read.
    expect(
      localStorage.getItem(__DRAFT_KEY_PREFIX + 'recon:old'),
    ).toBeNull();
  });

  it('keeps entries that are still within the 24h window', () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow);
    saveDraft('recon:fresh', 'live');
    // Bump clock by 23h59m.
    vi.setSystemTime(realNow + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    expect(loadDraft('recon:fresh')).toBe('live');
  });

  it('treats corrupt JSON as missing and removes the key', () => {
    localStorage.setItem(__DRAFT_KEY_PREFIX + 'recon:bad', '{not-json');
    expect(loadDraft('recon:bad')).toBeNull();
    expect(
      localStorage.getItem(__DRAFT_KEY_PREFIX + 'recon:bad'),
    ).toBeNull();
  });

  it('loadDraftSavedAt returns the savedAt epoch for live drafts and null otherwise', () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow);
    saveDraft('recon:ts', 'value');
    expect(loadDraftSavedAt('recon:ts')).toBe(realNow);
    expect(loadDraftSavedAt('recon:does-not-exist')).toBeNull();
  });

  it('listDrafts returns every active draft matching the prefix', () => {
    saveDraft('recon:1', 'a');
    saveDraft('recon:2', 'b');
    saveDraft('other:3', 'c');
    const list = listDrafts<string>('recon:');
    expect(list.map((l) => l.key).sort()).toEqual(['recon:1', 'recon:2']);
    expect(list.find((l) => l.key === 'recon:1')?.value).toBe('a');
    // Each listing must carry savedAt for the eyebrow timestamp.
    for (const l of list) {
      expect(typeof l.savedAt).toBe('number');
    }
  });

  it('listDrafts garbage-collects expired entries while iterating', () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(realNow);
    saveDraft('recon:live', 'live');
    saveDraft('recon:dead', 'dead');
    vi.setSystemTime(realNow + __DRAFT_TTL_MS + 1);
    // Only 'live' should be present after we re-save it inside the window.
    saveDraft('recon:live', 'still-live');

    const list = listDrafts<string>('recon:');
    expect(list.map((l) => l.key)).toEqual(['recon:live']);
    expect(
      localStorage.getItem(__DRAFT_KEY_PREFIX + 'recon:dead'),
    ).toBeNull();
  });
});
