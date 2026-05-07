import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { getAuditLog, type AppliedAuditLogFilter, type AuditLogPage } from '../api/auditLog';
import { useDebouncedValue } from './useDebouncedValue';

const STALE_30_S = 30_000;

/**
 * TanStack query for `GET /audit-log`. Debounces the FTS `q` field by
 * 300ms so character-by-character typing doesn't fire a fetch storm; the
 * other filter fields commit immediately when the consumer changes the
 * applied filter (typically on the "Apply" button click).
 */
export function useAuditLogQuery(filter: AppliedAuditLogFilter) {
  const debouncedQ = useDebouncedValue(filter.q, 300);
  const effectiveFilter: AppliedAuditLogFilter = { ...filter, q: debouncedQ };
  return useQuery<AuditLogPage, ApiError>({
    queryKey: ['audit-log', effectiveFilter],
    queryFn: () => getAuditLog(effectiveFilter),
    staleTime: STALE_30_S,
    placeholderData: (prev) => prev,
  });
}
