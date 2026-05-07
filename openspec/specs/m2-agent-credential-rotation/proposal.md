# Proposal: m2-agent-credential-rotation

> **Wave 1.17** — Adds `POST /agent-credentials/:id/rotate` so an Owner can swap an agent's Ed25519 public key in a single atomic transaction without revoke+re-register churn. Slice #2 of the user's 4-slice backend tech-debt batch.

## Problem

Wave 1.13 [3c] (`m2-mcp-agent-registry-bench`) shipped per-agent Ed25519 signing with `agent_credentials` rows holding the public key, plus REST endpoints to register / list / revoke / hard-delete a credential. **Key rotation is not first-class today.** Operators rotate by:

1. Generate new keypair locally.
2. Revoke the old credential (`PUT /agent-credentials/:id/revoke`).
3. Hard-DELETE the old row (the unique index covers ALL rows, so re-register requires DELETE first).
4. Register the new public key as a new row (`POST /agent-credentials`).
5. Reconfigure the agent with the new private key + the **new `id`** (UUID changed).

Steps 2–4 leave a window where the agent has zero valid credential. The agent's `X-Agent-Id` value also changes — anything else referencing the old id (logs, secret stores, deploy manifests) needs reconfiguration. The 3c retro filed `m2-agent-credential-rotation` explicitly: "an explicit rotation API would be safer (atomic swap of public key without a window where neither is valid)".

## Goals

1. **`POST /agent-credentials/:id/rotate`** — Owner-only, body `{publicKey: string}`, transactionally swaps the row's `public_key`. The row's `id`, `agentName`, `role`, and `createdAt` stay; only `publicKey` changes. Returns the updated row (without echoing the public key, per the existing DTO discipline).
2. **`@AuditAggregate('agent_credential')`** on the new endpoint so the existing 3a `BeforeAfterAuditInterceptor` emits `AGENT_ACTION_FORENSIC` with `payload_before.publicKey` (old) + `payload_after.publicKey` (new). Auditors get a forensically-grounded record of every key rotation.
3. **State machine discipline** — rotation refuses revoked credentials. Returns 409 `AGENT_CREDENTIAL_REVOKED` if the row's `revokedAt !== null`. Rotation does NOT un-revoke.
4. **Operator runbook update** — `docs/operations/m2-mcp-agent-registry-bench-runbook.md` gains a "Key rotation" section documenting the rotation flow + when to prefer rotation vs revoke+re-register.

## Non-goals

- **Grace period for the old key** — instant swap is the simplest correctness model. A grace period (old key valid for N minutes after rotation) adds significant complexity (storing a `previous_public_key` column + per-verification fallback). Rotation is a rare event; agents restart briefly with their new private key and the window is small. Filed `m2-agent-credential-rotation-grace-period` if PROD tells us otherwise.
- **Emergency rotation flow** — when the private key is suspected compromised, the right move today is `revoke` (instant invalidation) followed by `register-new`. Rotation is for planned key turnover. Documented in the runbook.
- **Multi-key support** — keeping multiple active public keys per agent (e.g. for parallel deployments) is out of scope. Filed `m2-agent-multi-key`.
- **Schema migration** — the `public_key` column already exists and is `text`; UPDATE works without DB-side changes. Zero migrations.
- **Web UI** — Owners curl/POST the endpoint. UI lands when filed `m2-agent-credentials-ui` ships.
- **Per-agent rotation policy / scheduling** — automated key rotation on a schedule (e.g. quarterly) is filed `m2-agent-credential-rotation-policy`.

## What changes (high level)

**`apps/api/src/agent-credentials/`:**

- `interface/dto/agent-credential.dto.ts` — new `RotateAgentCredentialDto` with a single `publicKey: string` field, length-validated identically to the existing `CreateAgentCredentialDto`.
- `interface/agent-credentials.controller.ts` — new `@Post(':id/rotate') @Roles('OWNER') @AuditAggregate('agent_credential')` handler.
- `application/agent-credentials.service.ts` — new `rotate(id, organizationId, publicKey)` method; resolves row via `getById` (already throws 404), checks `isActive()` (throws 409 if revoked), updates `publicKey`, saves.
- `domain/agent-credential.entity.ts` — new `rotatePublicKey(newPublicKey: string): void` method (encapsulates the mutation; no behaviour beyond the assignment, but matches the entity's existing `revoke()` style).

**Tests:**

- `application/agent-credentials.service.spec.ts` — 3 new tests: rotation succeeds + returns updated row; rotation throws `ConflictException` `AGENT_CREDENTIAL_REVOKED` on revoked row; rotation throws `NotFoundException` on missing id (per-org-scoped).
- `interface/agent-credentials.controller.spec.ts` — 2 new tests: rotation handler calls service + returns updated row in `WriteResponseDto`; RBAC rejects non-Owner.
- `agent-credentials.int.spec.ts` (existing INT spec) — 2 new scenarios: rotation end-to-end (POST register → POST rotate → row.publicKey changed; row.id unchanged); rotation against a revoked row returns 409 + leaves row untouched.

**Docs:**

- `docs/operations/m2-mcp-agent-registry-bench-runbook.md` — append "Key rotation" section.

## Acceptance

1. `POST /agent-credentials/:id/rotate` with body `{"publicKey": "<new base64>"}` succeeds for an active credential and persists the new public key. Returns 200 with `WriteResponseDto<{id, agentName, role, createdAt, revokedAt}>` (publicKey NOT echoed).
2. The audit_log carries one `AGENT_ACTION_FORENSIC` row with `aggregate_type='agent_credential'`, `payload_before.publicKey` (old), and `payload_after.publicKey` (new). Already automatic via `@AuditAggregate` + `BeforeAfterAuditInterceptor`.
3. Rotation against a revoked credential (`revokedAt !== null`) returns HTTP 409 with `{code: 'AGENT_CREDENTIAL_REVOKED'}`. The row is untouched.
4. Rotation against an unknown id returns HTTP 404 `{code: 'AGENT_CREDENTIAL_NOT_FOUND'}`.
5. Rotation by a non-Owner returns HTTP 403 (Roles guard).
6. Rotation across org boundaries returns 404 (per-org isolation; the service's `getById` already gates on `organizationId`).
7. Subsequent signed requests from the agent verify against the new public key; the previous key no longer verifies. (Verified at INT level by emitting one signed request with old key → 401, then with new key → 200.)
8. apps/api unit + INT specs green. Build + lint clean.

## Risk + mitigation

- **Risk: in-flight requests signed with the old key fail mid-rotation.** Probability low; rotation is a brief window during planned operations. Mitigation: documented in the runbook ("Restart the agent after rotation; in-flight requests signed with the old key may fail with 401"). Grace period filed if PROD complains.
- **Risk: an attacker with Owner credentials could silently rotate to a key they control.** Mitigation: the audit_log row records the rotation with `payload_before.publicKey` + `payload_after.publicKey` + `actorUserId` of the human Owner who triggered it. Plus the existing `@AuditAggregate` mechanism + the runbook recommends Owner-only credentials are themselves protected. Out of scope: 2FA on Owner role itself (M3+).
- **Risk: rotation on a revoked row silently un-revokes if the service forgets to check.** Mitigation: F2 picks "reject revoked"; service's first action is `if (!row.isActive()) throw ConflictException`. Unit-tested.

## Open questions

None at the time of writing — Gate D picks confirmed (rotation as POST :id/rotate / refuse on revoked / @AuditAggregate / UPDATE same row / no grace period).

## Related slices + threads

- Wave 1.13 [3c] `m2-mcp-agent-registry-bench` (Squash `17b37c1`) — shipped the agent_credentials BC + signature middleware this slice extends.
- Wave 1.14 `m2-audit-log-forensic-split` (Squash `339b039`) — established `AGENT_ACTION_FORENSIC` as the channel for rich aggregate-anchored emissions; rotation event lands here.
- Wave 1.16 `m2-mcp-bench-ci` (Squash `772080e`) — slice #1 of this 4-slice backend batch.

## Filed follow-ups

- `m2-agent-credential-rotation-grace-period` — `previous_public_key` column + N-minute grace window if PROD reveals the instant-swap window is too narrow.
- `m2-agent-credential-rotation-policy` — scheduled / automated rotation enforcement.
- `m2-agent-multi-key` — multiple active keys per agent.
- `m2-agent-credentials-ui` — Owner UI for the credential CRUD + rotation.
