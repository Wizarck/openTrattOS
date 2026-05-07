# Design: m2-agent-credential-rotation

> Wave 1.17. Companion: `proposal.md`.

## Architecture

Single new endpoint + matching service method + entity helper. No schema migration. Reuses the entire 3a + 3c agent_credentials + signature pipeline.

```
HTTP
  POST /agent-credentials/:id/rotate
       │  body: { publicKey: string }
       │  Roles: OWNER
       │  @AuditAggregate('agent_credential')
       ▼
AgentCredentialsController.rotate(id, dto, req)
       │
       ▼
AgentCredentialsService.rotate(id, organizationId, publicKey)
       ├── getById(id, organizationId)  → 404 if absent
       ├── if (!row.isActive())          → 409 AGENT_CREDENTIAL_REVOKED
       ├── row.rotatePublicKey(publicKey)  (entity helper, ~3 LOC)
       └── repo.save(row)
       │
       ▼
AgentCredential entity (UPDATE same row; UUID id unchanged)
```

## Service method

```ts
async rotate(
  id: string,
  organizationId: string,
  publicKey: string,
): Promise<AgentCredential> {
  const row = await this.getById(id, organizationId);  // throws 404 if missing
  if (!row.isActive()) {
    throw new ConflictException({ code: 'AGENT_CREDENTIAL_REVOKED' });
  }
  row.rotatePublicKey(publicKey);
  return this.repo.save(row);
}
```

The flow mirrors the existing `revoke()` method's shape — `getById` first (which already enforces per-org scope and throws 404), then state check, then mutate, then save. Re-using `getById` means the per-org-isolation contract remains in one place.

## Entity helper

```ts
// In domain/agent-credential.entity.ts
rotatePublicKey(newPublicKey: string): void {
  // Caller is responsible for length / format validation; the DTO enforces
  // both (MinLength + MaxLength + base64 shape per CreateAgentCredentialDto).
  this.publicKey = newPublicKey;
}
```

Trivial; encapsulates the field assignment so service code reads `row.rotatePublicKey(...)` instead of `row.publicKey = ...`. Matches the existing `revoke()` style.

## DTO

```ts
// In interface/dto/agent-credential.dto.ts
export class RotateAgentCredentialDto {
  @ApiProperty({ description: 'Base64-encoded SPKI/DER form of the new Ed25519 public key' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)  // matches CreateAgentCredentialDto's publicKey constraint
  publicKey!: string;
}
```

`MaxLength(4096)` matches the column CHECK constraint set in migration 0021. Matching the existing `CreateAgentCredentialDto` constraints ensures rotation accepts the same shape of public key as registration — no surprise rejections.

## Controller

```ts
@Post(':id/rotate')
@Roles('OWNER')
@AuditAggregate('agent_credential')
@ApiOperation({
  summary: 'Rotate an agent credential\'s public key (atomic swap)',
  description:
    'Replaces the row\'s public_key in a single transaction. The id, agentName, role, and createdAt are preserved. Refuses revoked credentials. Use this for planned key turnover; for emergency invalidation use the revoke endpoint.',
})
async rotate(
  @Param('id', new ParseUUIDPipe()) id: string,
  @Body() dto: RotateAgentCredentialDto,
  @Req() req: Request,
): Promise<WriteResponseDto<AgentCredentialResponse>> {
  const user = requireUser(req);
  const row = await this.service.rotate(id, user.organizationId, dto.publicKey);
  return toWriteResponse(toResponse(row));
}
```

Matches the existing `revoke()` handler shape exactly — same DI (`requireUser`), same response wrapping (`toResponse` doesn't echo publicKey), same audit decorator. The only new wire is the body DTO.

## Sub-decisions

### SD1 — `@AuditAggregate('agent_credential')` not `@AuditAggregate('agent_credential', null)`

The existing `revoke()` and `delete()` handlers use `@AuditAggregate('agent_credential')` without the `null` second argument because the id is on the URL path and the interceptor extracts it via the default extractor. Rotation matches that pattern.

The `null` second argument is only used on `create()` because the id isn't in the URL — it's generated server-side and surfaces in the response body, where the interceptor extracts it.

### SD2 — Atomic mutation = single repo.save()

TypeORM's `save()` issues an UPDATE for an existing entity. The single statement is atomic at the DB level. Subsequent reads see the new public key; the old key is unrecoverable from the row (recorded only in the `payload_before` of the audit row).

### SD3 — Audit_log is the historical record of the old key

Operators investigating "what was the public key on agent X at time T?" query audit_log with `aggregate_id=X` filtered by `event_type='AGENT_ACTION_FORENSIC'` and order by `created_at DESC` to find the most recent rotation; the `payload_before.publicKey` of that row is the prior value.

This is sufficient for forensic timeline reconstruction. If operational needs grow ("attest to the public key on agent X at exactly time T without reading audit_log"), `m2-agent-credential-rotation-history-table` would carry the dedicated history; out of scope.

### SD4 — No payload sanitisation in payload_before/payload_after

The publicKey value is included verbatim in both. Public keys are public; recording them in audit_log is fine. The DTO discipline of "don't echo publicKey in responses" is about not surfacing it in operator-visible HTTP response bodies (where it could leak via logs / forwarding); audit_log is operator-internal storage.

### SD5 — Refuse rotation on revoked credentials (no un-revoke shortcut)

Tempting alternative: rotation un-revokes (sets `revokedAt=null` + new key). Rejected because it overloads the state machine — revoke is a deliberate "this key is dead forever" signal, and un-revoking via rotation would let a single endpoint resurrect a credential that was deliberately killed. Operators wanting to bring back a revoked agent should hard-DELETE + re-register.

## Test strategy

Unit tests:

- `application/agent-credentials.service.spec.ts` — 3 new tests:
  1. `rotate(id, org, newKey)` on an active row updates publicKey + returns the saved row.
  2. `rotate(id, org, newKey)` on a revoked row throws `ConflictException` `AGENT_CREDENTIAL_REVOKED`; repo.save NOT called.
  3. `rotate(missingId, org, newKey)` throws `NotFoundException` (delegated to `getById`).

- `interface/agent-credentials.controller.spec.ts` — 2 new tests:
  1. `rotate(id, dto, req)` returns `WriteResponseDto<AgentCredentialResponse>` with `data.id = id` + `data.publicKey` undefined.
  2. RBAC: a Manager-role user gets the 403 (covered at the Roles-guard level; spec asserts decorator presence).

INT tests:

- `agent-credentials.int.spec.ts` — 2 new scenarios:
  1. **End-to-end rotation**: register a credential → rotate via POST → query the row directly → assert `public_key` changed and `id` unchanged.
  2. **Rotation against revoked**: register → revoke → rotate → assert HTTP 409 + DB row unchanged.

The verifying-with-new-key scenario (rotation followed by signed request) is tested at the existing `agent-signature.int.spec.ts` level if signed-request tests already exist; if not, a third INT scenario in this spec file isolates the proof.

## Out-of-scope follow-ups

Listed in proposal.md `Filed follow-ups`. Notable: `m2-agent-credential-rotation-grace-period`, `m2-agent-credential-rotation-policy`, `m2-agent-multi-key`, `m2-agent-credentials-ui`.
