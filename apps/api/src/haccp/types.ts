/**
 * HACCP BC inline types (no contracts-package import per cross-slice contract
 * pattern documented in proposal.md).
 *
 * The j10 mock + the agent surface + the REST controllers all converge on
 * these shapes. Slice #10 (parallel sibling) will declare equivalent types
 * in `apps/web/src/api/haccp.ts` for the frontend.
 */

/** Aggregate type used on every audit_log envelope emitted by this BC. */
export const HACCP_RECORD_AGGREGATE_TYPE = 'haccp_record' as const;

/** Default + maximum limit for the recent-readings strip. */
export const RECENT_READINGS_DEFAULT_LIMIT = 5 as const;
export const RECENT_READINGS_MAX_LIMIT = 50 as const;

/**
 * CCP input rendering type. Drives the j10 picker variant choice. The DB
 * column on a reading is `reading_value numeric` (numeric / range) PLUS
 * `reading_extras jsonb` (checkbox / multi-select payload).
 */
export type CcpInputType = 'numeric' | 'checkbox' | 'multi-select' | 'range';

export const CCP_INPUT_TYPES: readonly CcpInputType[] = [
  'numeric',
  'checkbox',
  'multi-select',
  'range',
];

/**
 * A CCP definition embedded in `fsms_standards.ccp_definitions` JSONB. The
 * Owner authors these per organization; the picker reads them when Carmen /
 * Mikel records a reading.
 */
export interface CcpDefinition {
  readonly id: string;
  readonly label: string;
  readonly inputType: CcpInputType;
  readonly unit?: string;
  readonly specMin?: number;
  readonly specMax?: number;
  /** Expected option labels for checkbox / multi-select inputs. */
  readonly expectedOptions?: readonly string[];
  /** IDs (uuids) of pre-defined `haccp_corrective_actions` rows to surface in the picker. */
  readonly recommendedCorrectiveActionIds?: readonly string[];
}

/**
 * Inline ad-hoc corrective-action input — when supplied, `recordReading()`
 * creates the `haccp_corrective_actions` row first then links the reading.
 */
export interface AdHocCorrectiveActionInput {
  readonly name: string;
  readonly notes?: string;
}

/**
 * Service-layer input for `recordReading()`. The REST DTO (controller) maps
 * to this shape after class-validator validates.
 *
 * Exactly one of `readingValue` / `readingExtras` MUST be supplied — the
 * service throws if both are null. For out-of-spec readings, exactly one of
 * `correctiveActionId` / `correctiveActionInput` MUST be supplied.
 */
export interface RecordReadingInput {
  readonly organizationId: string;
  readonly ccpId: string;
  /** Optional explicit FSMS standard pin; defaults to the active standard at `now()`. */
  readonly fsmsStandardId?: string;
  readonly readingValue?: number | null;
  readonly readingExtras?: Record<string, unknown> | null;
  readonly readingUnit?: string | null;
  readonly correctiveActionId?: string;
  readonly correctiveActionInput?: AdHocCorrectiveActionInput;
  readonly actorUserId?: string | null;
}

export interface RecordCorrectiveActionInput {
  readonly organizationId: string;
  readonly fsmsStandardId: string;
  readonly ccpId: string;
  readonly name: string;
  readonly notes?: string;
  readonly actorUserId?: string | null;
}

export interface ConfigureFsmsStandardInput {
  readonly organizationId: string;
  readonly name: string;
  readonly version: string;
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date | null;
  readonly ccpDefinitions: readonly CcpDefinition[];
  readonly terminatesPrior?: boolean;
  readonly actorUserId?: string | null;
}

/**
 * The materialised `haccp_ccp_readings` row projected for service callers.
 * The TypeORM entity carries the same shape; this interface keeps the
 * service-layer return type decoupled from the entity for testing.
 */
export interface CcpReadingSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly fsmsStandardId: string;
  readonly fsmsStandardVersion: string;
  readonly ccpId: string;
  readonly readingValue: number | null;
  readonly readingUnit: string | null;
  readonly readingExtras: Record<string, unknown> | null;
  readonly specMin: number | null;
  readonly specMax: number | null;
  readonly inSpec: boolean;
  readonly correctiveActionId: string | null;
  readonly actorUserId: string | null;
  readonly createdAt: Date;
}

/**
 * `payload_after` shape for `CCP_READING_RECORDED` audit envelope.
 */
export interface CcpReadingRecordedPayload {
  readonly ccpId: string;
  readonly fsmsStandardId: string;
  readonly fsmsStandardVersion: string;
  readonly readingValue: number | null;
  readonly readingUnit: string | null;
  readonly readingExtras: Record<string, unknown> | null;
  readonly specMin: number | null;
  readonly specMax: number | null;
  readonly inSpec: boolean;
  readonly correctiveActionId: string | null;
}

/**
 * `payload_after` shape for `CCP_CORRECTIVE_ACTION_RECORDED` audit envelope.
 */
export interface CorrectiveActionRecordedPayload {
  readonly fsmsStandardId: string;
  readonly ccpId: string;
  readonly name: string;
  readonly notes: string | null;
  readonly creationMode: 'predefined' | 'ad-hoc';
}

/**
 * `payload_after` shape for `FSMS_STANDARD_CONFIGURED` audit envelope.
 * Notably omits the full `ccpDefinitions` array to keep audit-row size
 * bounded — the count is carried, the full payload is available via the
 * `fsms_standards` table by id.
 */
export interface FsmsStandardConfiguredPayload {
  readonly name: string;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly ccpDefinitionsCount: number;
  readonly terminatesPrior: boolean;
}
