/**
 * Emit-side channel constants for HACCP envelopes. These mirror the slice
 * #21 audit-log channel naming convention (`<bc>.<verb-phrase>`). The
 * AuditLogSubscriber registers `@OnEvent` on these strings; the source
 * services emit envelopes via `events.emitAsync(channel, envelope)`.
 *
 * NOTE: keep these strings IN SYNC with
 * `apps/api/src/audit-log/application/types.ts` (`AuditEventType` map). If
 * the names drift, the subscriber will not receive emissions.
 */
export const CCP_READING_RECORDED_CHANNEL = 'haccp.ccp-reading-recorded' as const;
export const CCP_CORRECTIVE_ACTION_RECORDED_CHANNEL =
  'haccp.corrective-action-recorded' as const;
export const FSMS_STANDARD_CONFIGURED_CHANNEL =
  'haccp.fsms-standard-configured' as const;
