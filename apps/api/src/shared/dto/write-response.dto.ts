/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: shared envelope for write
 * endpoint responses, per the `m2-mcp-server` spec contract:
 * `{ data, missingFields, nextRequired }`.
 *
 * `missingFields` is a domain concept — fields that are required for the
 * entity to leave draft state. It is NOT the same as request validation
 * (which is enforced at the DTO layer and returns 422). Examples:
 *   - Recipe with `name` only → `missingFields=['lines','portions']`
 *   - MenuItem without `sellingPrice` → `missingFields=['sellingPrice']`
 *
 * `nextRequired` is the recommended next step for a conversational caller
 * (e.g. WhatsApp agent). It is one of the entries in `missingFields`, or
 * `null` when `missingFields` is empty.
 *
 * Conversational callers (Journey 5 WhatsApp) parse this contract to drive
 * follow-up prompts: "OK, I created the recipe. Next we need to add at
 * least one ingredient line — what's first?"
 */
export interface WriteResponseDto<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export interface WriteResponseOptions {
  missingFields?: string[];
  nextRequired?: string | null;
}

/**
 * Build a `WriteResponseDto<T>` with sensible defaults: `missingFields=[]`
 * and `nextRequired=null` when not provided. The helper exists primarily
 * for controllers that already know the entity is "complete" — they pass
 * just `data` and the contract is auto-completed.
 *
 * For partial-state writes, services SHOULD compute `missingFields` based
 * on domain knowledge and pass them explicitly:
 *
 *     return toWriteResponse(recipe, {
 *       missingFields: missing,
 *       nextRequired: missing[0] ?? null,
 *     });
 */
export function toWriteResponse<T>(
  data: T,
  opts: WriteResponseOptions = {},
): WriteResponseDto<T> {
  const missingFields = opts.missingFields ?? [];
  const nextRequired =
    opts.nextRequired !== undefined
      ? opts.nextRequired
      : missingFields.length > 0
        ? missingFields[0]
        : null;
  return { data, missingFields, nextRequired };
}
