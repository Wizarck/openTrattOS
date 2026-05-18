/**
 * Sprint 4 W3-13 — generic 24h-TTL localStorage wrapper for the j11
 * reconciliation "Borrador de resolución" feature (spec §Edge cases:
 * "Drafts persist locally for 24 hours; the row shows a mute eyebrow
 * `Borrador de resolución · 14:32 ayer`").
 *
 * Why a separate primitive
 * ------------------------
 * The reconciliation resolution drawer (W3-6) lets the operator type
 * free-form notes that are sent with the resolve mutation. If they
 * close the drawer before submitting, j11 wants the typed text to
 * survive a 24h reload so they can resume. localStorage is the right
 * tier (per-device, persistent across tab close, no server round-trip)
 * and the 24h envelope lives in the value itself so we don't need a
 * background sweeper — `loadDraft` returns `null` for expired keys.
 *
 * The wrapper is generic on purpose. The "type" of the stored value is
 * caller-defined (notes string today; could be the whole drawer form
 * tomorrow); we serialise via JSON.stringify with no schema check.
 * Corrupt entries are treated as missing.
 */

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_KEY_PREFIX = 'nexandro:draft:';

interface DraftEnvelope<TValue = unknown> {
  v: 1;
  savedAt: number; // epoch ms
  value: TValue;
}

/**
 * Persist `value` under `key`. The 24h envelope is rewritten on every
 * save — typing one extra character resets the clock, which matches
 * the operator expectation ("I just edited this, it's still live").
 */
export function saveDraft<TValue>(key: string, value: TValue): void {
  if (typeof localStorage === 'undefined') return;
  const envelope: DraftEnvelope<TValue> = {
    v: 1,
    savedAt: Date.now(),
    value,
  };
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded / private-mode storage rejection. Drafting is a
    // nice-to-have; never wedge the UI on a storage failure.
  }
}

/**
 * Return the saved value if present and unexpired; otherwise null.
 * Expired entries are eagerly deleted on read so the local store
 * trends toward the active working set without a background sweeper.
 */
export function loadDraft<TValue = unknown>(key: string): TValue | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(DRAFT_KEY_PREFIX + key);
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as DraftEnvelope<TValue>;
    if (env?.v !== 1 || typeof env.savedAt !== 'number') {
      localStorage.removeItem(DRAFT_KEY_PREFIX + key);
      return null;
    }
    if (Date.now() - env.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY_PREFIX + key);
      return null;
    }
    return env.value;
  } catch {
    localStorage.removeItem(DRAFT_KEY_PREFIX + key);
    return null;
  }
}

/**
 * `savedAt` timestamp for a draft (epoch ms) — used by the list-view
 * eyebrow to render `Borrador de resolución · HH:MM` (j11 spec). Same
 * expiry semantics as `loadDraft`: expired entries return null.
 */
export function loadDraftSavedAt(key: string): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(DRAFT_KEY_PREFIX + key);
  if (raw === null) return null;
  try {
    const env = JSON.parse(raw) as DraftEnvelope;
    if (env?.v !== 1 || typeof env.savedAt !== 'number') return null;
    if (Date.now() - env.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY_PREFIX + key);
      return null;
    }
    return env.savedAt;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + key);
  } catch {
    // ignore
  }
}

export interface DraftListing<TValue = unknown> {
  key: string;
  value: TValue;
  savedAt: number;
}

/**
 * Enumerate active (unexpired) drafts whose key starts with `prefix`.
 * Useful for the ReconciliationTab eyebrow that needs to know which
 * rows have a draft without loading each one individually.
 *
 * Expired entries are removed eagerly on encounter.
 */
export function listDrafts<TValue = unknown>(
  prefix: string,
): Array<DraftListing<TValue>> {
  if (typeof localStorage === 'undefined') return [];
  const out: Array<DraftListing<TValue>> = [];
  const fullPrefix = DRAFT_KEY_PREFIX + prefix;
  const expired: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (!fullKey || !fullKey.startsWith(fullPrefix)) continue;
    const raw = localStorage.getItem(fullKey);
    if (raw === null) continue;
    try {
      const env = JSON.parse(raw) as DraftEnvelope<TValue>;
      if (env?.v !== 1 || typeof env.savedAt !== 'number') {
        expired.push(fullKey);
        continue;
      }
      if (Date.now() - env.savedAt > DRAFT_TTL_MS) {
        expired.push(fullKey);
        continue;
      }
      out.push({
        key: fullKey.slice(DRAFT_KEY_PREFIX.length),
        value: env.value,
        savedAt: env.savedAt,
      });
    } catch {
      expired.push(fullKey);
    }
  }
  // Cleanup pass after the read loop so we don't mutate the index while iterating.
  for (const k of expired) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
  return out;
}

// Exported for tests so they can clear the prefix without touching
// every other key in localStorage.
export const __DRAFT_KEY_PREFIX = DRAFT_KEY_PREFIX;
export const __DRAFT_TTL_MS = DRAFT_TTL_MS;
