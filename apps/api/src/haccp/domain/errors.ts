/**
 * Domain-level errors for the HACCP BC. Controllers translate to HTTP codes.
 */

export class OutOfSpecRequiresCorrectiveActionError extends Error {
  readonly code = 'OUT_OF_SPEC_REQUIRES_CORRECTIVE_ACTION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'OutOfSpecRequiresCorrectiveActionError';
  }
}

export class CcpNotInFsmsStandardError extends Error {
  readonly code = 'CCP_NOT_IN_FSMS_STANDARD' as const;
  constructor(ccpId: string, fsmsStandardId: string) {
    super(
      `CCP ${ccpId} is not defined in FSMS standard ${fsmsStandardId}; ` +
        `register the CCP in fsms_standards.ccp_definitions before recording readings.`,
    );
    this.name = 'CcpNotInFsmsStandardError';
  }
}

export class FsmsStandardNotFoundError extends Error {
  readonly code = 'FSMS_STANDARD_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'FsmsStandardNotFoundError';
  }
}

export class FsmsStandardConflictError extends Error {
  readonly code = 'FSMS_STANDARD_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'FsmsStandardConflictError';
  }
}

export class ReadingShapeError extends Error {
  readonly code = 'READING_SHAPE_INVALID' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ReadingShapeError';
  }
}

export class CorrectiveActionNotFoundError extends Error {
  readonly code = 'CORRECTIVE_ACTION_NOT_FOUND' as const;
  constructor(id: string) {
    super(`CorrectiveAction ${id} not found for the given organization.`);
    this.name = 'CorrectiveActionNotFoundError';
  }
}
