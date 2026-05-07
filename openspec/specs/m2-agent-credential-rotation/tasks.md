# Tasks: m2-agent-credential-rotation

> Wave 1.17. 3 stages, single PR. Slice #2 of the 4-slice backend tech-debt batch.

## Stage 1 — entity + DTO + service + controller

- [ ] `apps/api/src/agent-credentials/domain/agent-credential.entity.ts` — add `rotatePublicKey(newPublicKey: string): void` method (~3 LOC).
- [ ] `apps/api/src/agent-credentials/interface/dto/agent-credential.dto.ts` — new `RotateAgentCredentialDto` class with `@IsString @MinLength(1) @MaxLength(4096)` on `publicKey`.
- [ ] `apps/api/src/agent-credentials/application/agent-credentials.service.ts` — new `rotate(id, organizationId, publicKey)` method that resolves via `getById`, checks `isActive()` (throws `ConflictException` `AGENT_CREDENTIAL_REVOKED` if revoked), calls entity helper, saves.
- [ ] `apps/api/src/agent-credentials/interface/agent-credentials.controller.ts` — new `@Post(':id/rotate') @Roles('OWNER') @AuditAggregate('agent_credential')` handler.

## Stage 2 — Tests

- [ ] `apps/api/src/agent-credentials/application/agent-credentials.service.spec.ts` — 3 new tests (rotate active OK / rotate revoked 409 / rotate missing id 404).
- [ ] `apps/api/src/agent-credentials/interface/agent-credentials.controller.spec.ts` — 2 new tests (rotate returns WriteResponseDto / decorator pres).
- [ ] `apps/api/src/agent-credentials/agent-credentials.int.spec.ts` — 2 new scenarios (end-to-end rotation / rotation against revoked 409).

## Stage 3 — Runbook update + verification + PR + Gate F

- [ ] `docs/operations/m2-mcp-agent-registry-bench-runbook.md` — append "Key rotation" section documenting:
  - When to use rotation vs revoke+re-register (planned vs emergency).
  - The 1-line curl recipe for rotation.
  - Restart-the-agent caveat (in-flight requests with old key may fail).
- [ ] `npm test --workspace=apps/api` green (current 795 → ≥800).
- [ ] `npm run build --workspace=apps/api` clean.
- [ ] `npm run lint --workspace=apps/api` clean.
- [ ] PR `proposal(m2-agent-credential-rotation): atomic Ed25519 keypair rotation API (Wave 1.17)`.
- [ ] CI green; squash-merge.
- [ ] Retro `retros/m2-agent-credential-rotation.md`.
- [ ] Memory updates: `project_m1_state.md` + `MEMORY.md`.
