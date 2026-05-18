/**
 * Sprint 4 W3-13 — generic offline action queue.
 *
 * Why this exists
 * ----------------
 * The j11 GR dock workflow runs on tablets in walk-in coolers and
 * receiving areas where Wi-Fi drops are routine (spec §Edge cases:
 * "Modo offline · N confirmaciones en cola"). When the network is
 * down we still want the operator to finish their receipt round; we
 * queue the confirmations locally and replay them once the radio
 * comes back.
 *
 * Storage strategy
 * -----------------
 * Production: raw IndexedDB (object store keyed by autoincrement id,
 * one row per queued action). We deliberately avoid adding `idb` to
 * the dependency tree — the API surface we need (open, add, getAll,
 * delete, count) is small enough that raw IDB is cheaper than a new
 * package + version pin.
 *
 * Tests (jsdom): `globalThis.indexedDB` is undefined in the test
 * environment and we don't pull in `fake-indexeddb` (see Hard rules
 * in the slice brief — no new deps). We fall back to a per-process
 * in-memory adapter so the queue's contract can be unit-tested in
 * pure jsdom. The adapter selection happens lazily at first call so
 * tests can stub `globalThis.indexedDB` before importing the module.
 *
 * Multi-tenant safety
 * -------------------
 * Every queued action carries its `orgId`. `flush()` and `count()`
 * filter by orgId so an operator switching organizations on the same
 * tablet never replays the wrong org's queue. The store itself is
 * single-tenant (one IDB database per browser profile) — the
 * filtering is what enforces isolation.
 */

const DB_NAME = 'nexandro-offline-queue';
const STORE_NAME = 'actions';
const DB_VERSION = 1;

export interface QueuedAction<TPayload = unknown> {
  /** Auto-assigned by the underlying adapter on enqueue. */
  id?: number;
  /** Discriminator the flush handler uses to pick a transport. */
  type: string;
  /** Caller-defined payload. We serialise it via structuredClone-equiv. */
  payload: TPayload;
  /** Epoch ms — when the action was queued (used for replay ordering). */
  createdAt: number;
  /** Org scope. flush()/count() filter by this. */
  orgId: string;
}

export interface FlushResult {
  flushed: number;
  failed: number;
}

/**
 * Pluggable storage adapter. We expose this so tests can inject a
 * deterministic in-memory adapter without touching `globalThis`.
 */
export interface OfflineQueueAdapter {
  enqueue(action: QueuedAction): Promise<number>;
  list(orgId: string): Promise<QueuedAction[]>;
  remove(id: number): Promise<void>;
  count(orgId: string): Promise<number>;
}

// ---------- IndexedDB adapter ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('byOrg', 'orgId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });
}

const indexedDbAdapter: OfflineQueueAdapter = {
  async enqueue(action) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Drop a pre-existing `id` so autoIncrement assigns one.
      const { id: _omit, ...rest } = action;
      void _omit;
      const id = await idbRequest(store.add(rest));
      return id as number;
    } finally {
      db.close();
    }
  },
  async list(orgId) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('byOrg');
      const rows = (await idbRequest(index.getAll(orgId))) as QueuedAction[];
      // Stable order: by createdAt asc; tie-break by id asc for determinism.
      return rows.sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        return (a.id ?? 0) - (b.id ?? 0);
      });
    } finally {
      db.close();
    }
  },
  async remove(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await idbRequest(tx.objectStore(STORE_NAME).delete(id));
    } finally {
      db.close();
    }
  },
  async count(orgId) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('byOrg');
      return (await idbRequest(index.count(orgId))) as number;
    } finally {
      db.close();
    }
  },
};

// ---------- In-memory adapter (jsdom / tests) ----------

function createMemoryAdapter(): OfflineQueueAdapter {
  const rows = new Map<number, QueuedAction>();
  let nextId = 1;
  return {
    async enqueue(action) {
      const { id: _omit, ...rest } = action;
      void _omit;
      const id = nextId++;
      rows.set(id, { ...rest, id });
      return id;
    },
    async list(orgId) {
      return [...rows.values()]
        .filter((r) => r.orgId === orgId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          return (a.id ?? 0) - (b.id ?? 0);
        });
    },
    async remove(id) {
      rows.delete(id);
    },
    async count(orgId) {
      let n = 0;
      for (const r of rows.values()) if (r.orgId === orgId) n++;
      return n;
    },
  };
}

// ---------- Adapter selection ----------

let activeAdapter: OfflineQueueAdapter | null = null;

function adapter(): OfflineQueueAdapter {
  if (activeAdapter) return activeAdapter;
  if (typeof indexedDB !== 'undefined') {
    activeAdapter = indexedDbAdapter;
  } else {
    activeAdapter = createMemoryAdapter();
  }
  return activeAdapter;
}

/**
 * Test-only: swap the adapter. Returns the previous one so the caller
 * can restore. Not exported from a barrel — direct import from
 * `lib/offlineQueue` only.
 */
export function __setOfflineQueueAdapter(
  next: OfflineQueueAdapter | null,
): OfflineQueueAdapter | null {
  const prev = activeAdapter;
  activeAdapter = next;
  return prev;
}

// ---------- Public API ----------

/**
 * Append an action to the queue. Returns the assigned id (mostly for
 * tests + telemetry; production callers ignore the result).
 */
export function enqueue<TPayload>(
  action: Omit<QueuedAction<TPayload>, 'id'>,
): Promise<number> {
  return adapter().enqueue(action as QueuedAction);
}

/**
 * Drain the queue for `orgId`. Each action is handed to `handler`; if
 * the handler resolves we delete the row. If it throws we leave the
 * row in place (so it replays on the next flush) and increment the
 * failed counter. Failures DO NOT abort the loop — a single bad row
 * shouldn't block the rest of the queue.
 *
 * Replay is sequential by `createdAt` so the operator sees their
 * confirmations land in the order they typed them. The single-flight
 * guard at the call-site (`useOfflineStatus`) prevents two flushes
 * stomping on each other when the radio flaps.
 */
export async function flush(
  orgId: string,
  handler: (action: QueuedAction) => Promise<void>,
): Promise<FlushResult> {
  const a = adapter();
  const rows = await a.list(orgId);
  let flushed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await handler(row);
      if (typeof row.id === 'number') {
        await a.remove(row.id);
      }
      flushed++;
    } catch {
      failed++;
    }
  }
  return { flushed, failed };
}

export function count(orgId: string): Promise<number> {
  return adapter().count(orgId);
}
