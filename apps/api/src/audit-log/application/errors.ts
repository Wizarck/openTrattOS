export class AuditLogQueryError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_DATE_RANGE' | 'LIMIT_OUT_OF_RANGE' | 'OFFSET_NEGATIVE',
  ) {
    super(message);
    this.name = 'AuditLogQueryError';
  }
}
