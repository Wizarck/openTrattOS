import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __setOfflineQueueAdapter,
  count,
  enqueue,
  flush,
  type QueuedAction,
} from './offlineQueue';

/**
 * Tests run in jsdom; `globalThis.indexedDB` is undefined, so the
 * offline queue falls back to its in-memory adapter automatically.
 * We reset the adapter between cases so each test starts with an
 * empty store.
 */
beforeEach(() => {
  __setOfflineQueueAdapter(null);
});
afterEach(() => {
  __setOfflineQueueAdapter(null);
});

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';

function action(
  orgId: string,
  type: string,
  payload: unknown,
  createdAt: number,
): Omit<QueuedAction, 'id'> {
  return { orgId, type, payload, createdAt };
}

describe('offlineQueue', () => {
  it('enqueue + count returns the number of queued actions for the org', async () => {
    expect(await count(ORG_A)).toBe(0);
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: '1' }, 1));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: '2' }, 2));
    expect(await count(ORG_A)).toBe(2);
  });

  it('count is scoped per orgId', async () => {
    await enqueue(action(ORG_A, 'gr.confirm', {}, 1));
    await enqueue(action(ORG_B, 'gr.confirm', {}, 1));
    await enqueue(action(ORG_B, 'gr.confirm', {}, 2));
    expect(await count(ORG_A)).toBe(1);
    expect(await count(ORG_B)).toBe(2);
  });

  it('flush replays each action and clears the queue on success', async () => {
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'a' }, 1));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'b' }, 2));

    const seen: string[] = [];
    const result = await flush(ORG_A, async (a) => {
      seen.push((a.payload as { lineId: string }).lineId);
    });

    expect(result).toEqual({ flushed: 2, failed: 0 });
    expect(seen).toEqual(['a', 'b']);
    expect(await count(ORG_A)).toBe(0);
  });

  it('flush preserves rows whose handler throws and counts them as failed', async () => {
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'ok' }, 1));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'boom' }, 2));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'also-ok' }, 3));

    const result = await flush(ORG_A, async (a) => {
      const payload = a.payload as { lineId: string };
      if (payload.lineId === 'boom') {
        throw new Error('simulated network failure');
      }
    });

    expect(result).toEqual({ flushed: 2, failed: 1 });
    // The failed row stays queued for the next flush attempt.
    expect(await count(ORG_A)).toBe(1);
  });

  it('flush is scoped per orgId — other orgs are untouched', async () => {
    await enqueue(action(ORG_A, 'gr.confirm', {}, 1));
    await enqueue(action(ORG_B, 'gr.confirm', {}, 1));

    const result = await flush(ORG_A, async () => {});

    expect(result.flushed).toBe(1);
    expect(await count(ORG_A)).toBe(0);
    // The B-org row is left alone.
    expect(await count(ORG_B)).toBe(1);
  });

  it('flush replays actions in createdAt order', async () => {
    // Insert out-of-order to prove the queue sorts on replay.
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'third' }, 30));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'first' }, 10));
    await enqueue(action(ORG_A, 'gr.confirm', { lineId: 'second' }, 20));

    const seen: string[] = [];
    await flush(ORG_A, async (a) => {
      seen.push((a.payload as { lineId: string }).lineId);
    });

    expect(seen).toEqual(['first', 'second', 'third']);
  });

  it('flush on an empty queue is a no-op and returns zeros', async () => {
    expect(await flush(ORG_A, async () => {})).toEqual({
      flushed: 0,
      failed: 0,
    });
  });
});
