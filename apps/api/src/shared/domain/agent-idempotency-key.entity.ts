import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: ORM mapping for the
 * `agent_idempotency_keys` table created by migration 0020.
 *
 * Composite primary key `(organization_id, key)` enforces per-org
 * isolation. `request_hash` is `sha256(method + path + canonicalBody)` so
 * we can detect "same key, different body" mismatches.
 */
@Entity({ name: 'agent_idempotency_keys' })
@Index('ix_agent_idempotency_keys_created_at', ['createdAt'])
export class AgentIdempotencyKey {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @PrimaryColumn({ name: 'key', type: 'text' })
  key!: string;

  @Column({ name: 'request_hash', type: 'text' })
  requestHash!: string;

  @Column({ name: 'response_status', type: 'int' })
  responseStatus!: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody!: unknown;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
