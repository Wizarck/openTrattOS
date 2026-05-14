import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bundleDownloadUrl,
  generateBundle,
  getBundleStatus,
  listBundles,
  type BundleStatusResponse,
  type ExportBundleSummary,
  type GenerateBundleRequest,
  type GenerateBundleResponse,
  type ListBundlesResponse,
} from '../api/appcc';
import { ApiError } from '../api/client';

/**
 * TanStack Query hooks for the j9 APPCC export trigger surface (slice
 * #15 m3-appcc-i18n-ui, Wave 2.7).
 *
 * On a successful `generateBundle` mutation we invalidate the archive
 * query so the new bundle surfaces in the archive table once the bundle
 * completes (slice #14's read model). SSE-driven progress is read by
 * the screen-level `EventSource`; this `useBundleStatus` provides a
 * polling fallback for environments where SSE is unavailable (e.g.
 * Vitest jsdom).
 */

const STALE_30_S = 30_000;

export function useBundleArchive(
  organizationId: string | undefined,
  limit = 10,
) {
  return useQuery<ListBundlesResponse, ApiError>({
    queryKey: ['appcc', 'archive', organizationId, limit],
    enabled: typeof organizationId === 'string',
    queryFn: () => listBundles(organizationId!, limit),
    staleTime: STALE_30_S,
  });
}

export function useGenerateBundle() {
  const queryClient = useQueryClient();
  return useMutation<GenerateBundleResponse, ApiError, GenerateBundleRequest>({
    mutationFn: (input) => generateBundle(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['appcc', 'archive', variables.organizationId],
      });
    },
  });
}

export function useBundleStatus(
  organizationId: string | undefined,
  bundleId: string | null,
) {
  return useQuery<BundleStatusResponse, ApiError>({
    queryKey: ['appcc', 'bundle', organizationId, bundleId],
    enabled: typeof organizationId === 'string' && bundleId != null,
    queryFn: () => getBundleStatus(organizationId!, bundleId!),
    staleTime: 0,
    // Polling fallback when SSE is unavailable. The screen disables this
    // refetch loop once the bundle reaches `ready` or `failed`.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'ready' || data?.status === 'failed') return false;
      return 2_000;
    },
  });
}

/**
 * Returns the proxied download URL for a bundle. The screen wires this
 * into a regular `<a>` or `window.open` call — no special hook state is
 * required because the URL is stable.
 */
export function useDownloadBundle(
  organizationId: string | undefined,
  bundleId: string,
  kind: 'pdf' | 'csv',
): string | null {
  if (organizationId == null) return null;
  return bundleDownloadUrl(organizationId, bundleId, kind);
}

// Re-exports for screen consumption.
export type { ExportBundleSummary };
