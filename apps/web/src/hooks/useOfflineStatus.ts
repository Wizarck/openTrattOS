import { useEffect, useState } from 'react';
import { count as queueCount } from '../lib/offlineQueue';

/**
 * Sprint 4 W3-13 — single source of truth for the GR tab's offline
 * banner.
 *
 * Returns:
 *   - `online`        — `navigator.onLine` mirrored into React state,
 *                       updated on `online` / `offline` window events.
 *   - `queuedCount`   — number of queued actions for `orgId`. Refreshed
 *                       when (a) the component mounts, (b) the
 *                       online/offline transition fires, and (c) the
 *                       caller bumps `refreshToken` (e.g. after a
 *                       successful enqueue).
 *
 * jsdom note
 * ----------
 * `navigator.onLine` defaults to `true` in jsdom and the events are
 * dispatchable via `window.dispatchEvent(new Event('offline'))`. Tests
 * exercise both transitions.
 */
export interface OfflineStatus {
  online: boolean;
  queuedCount: number;
}

export function useOfflineStatus(
  orgId: string | undefined,
  refreshToken?: number,
): OfflineStatus {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [queuedCount, setQueuedCount] = useState<number>(0);

  // Track online/offline transitions.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Refresh queued count whenever the relevant inputs change.
  useEffect(() => {
    if (!orgId) {
      setQueuedCount(0);
      return;
    }
    let cancelled = false;
    queueCount(orgId)
      .then((n) => {
        if (!cancelled) setQueuedCount(n);
      })
      .catch(() => {
        // Storage errors should never wedge the UI; treat as "no
        // queued items" and let the next mount retry.
        if (!cancelled) setQueuedCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, online, refreshToken]);

  return { online, queuedCount };
}
