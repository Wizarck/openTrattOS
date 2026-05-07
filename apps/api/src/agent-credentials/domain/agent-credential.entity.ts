import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { UserRole } from '../../iam/domain/user.entity';

export interface AgentCredentialCreateProps {
  organizationId: string;
  agentName: string;
  publicKey: string;
  role: UserRole;
}

/**
 * Wave 1.13 [3c] — m2-mcp-agent-registry-bench. Per-org row holding the
 * Ed25519 public key of an agent that has registered with the
 * organization. The signature middleware looks up the row by `id`
 * (= `X-Agent-Id`) and verifies `X-Agent-Signature` against `publicKey`.
 *
 * Per ADR-AGENT-CRED-1: soft-delete via `revokedAt`. Once a credential is
 * revoked the row stays so historical audit queries can still resolve
 * `agent_name` → `id` bindings; live verification refuses revoked rows.
 *
 * Re-registering an agent under the same `agentName` after revocation
 * requires a hard DELETE first (the unique index covers ALL rows, not
 * just active ones). Operators do this via the runbook.
 */
@Entity({ name: 'agent_credentials' })
@Index('uq_agent_credentials_org_agent_name', ['organizationId', 'agentName'], { unique: true })
@Index('ix_agent_credentials_organization_id', ['organizationId'])
export class AgentCredential {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'agent_name', type: 'varchar', length: 64 })
  agentName!: string;

  /** Base64-encoded SPKI / DER form of the Ed25519 public key. */
  @Column({ name: 'public_key', type: 'text' })
  publicKey!: string;

  @Column({ type: 'varchar', length: 32 })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  static create(props: AgentCredentialCreateProps): AgentCredential {
    const row = new AgentCredential();
    row.id = randomUUID();
    row.organizationId = props.organizationId;
    row.agentName = props.agentName;
    row.publicKey = props.publicKey;
    row.role = props.role;
    row.createdAt = new Date();
    row.revokedAt = null;
    return row;
  }

  isActive(): boolean {
    return this.revokedAt === null;
  }

  revoke(at: Date = new Date()): void {
    if (this.revokedAt === null) {
      this.revokedAt = at;
    }
  }

  /**
   * Atomic key swap (Wave 1.17 m2-agent-credential-rotation per ADR).
   * Encapsulates the field assignment so service code reads
   * `row.rotatePublicKey(...)` mirroring the existing `revoke()` shape.
   * Caller (the DTO) is responsible for length / format validation.
   */
  rotatePublicKey(newPublicKey: string): void {
    this.publicKey = newPublicKey;
  }
}
