import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useOfflineStatus } from './useOfflineStatus';
import { __setOfflineQueueAdapter, enqueue } from '../lib/offlineQueue';

const ORG = 'org-offline-status';

beforeEach(() => {
  __setOfflineQueueAdapter(null);
});
afterEach(() => {
  __setOfflineQueueAdapter(null);
});

describe('useOfflineStatus', () => {
  it('mirrors navigator.onLine and toggles on online/offline events', async () => {
    const { result } = renderHook(() => useOfflineStatus(ORG));
    // jsdom default: navigator.onLine === true.
    expect(result.current.online).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(result.current.online).toBe(false));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.online).toBe(true));
  });

  it('reflects the queued action count for the given orgId', async () => {
    await enqueue({
      orgId: ORG,
      type: 'gr.confirm',
      payload: {},
      createdAt: Date.now(),
    });
    await enqueue({
      orgId: ORG,
      type: 'gr.confirm',
      payload: {},
      createdAt: Date.now() + 1,
    });

    const { result } = renderHook(() => useOfflineStatus(ORG));
    await waitFor(() => expect(result.current.queuedCount).toBe(2));
  });

  it('returns 0 queued when orgId is undefined', () => {
    const { result } = renderHook(() => useOfflineStatus(undefined));
    expect(result.current.queuedCount).toBe(0);
  });
});
