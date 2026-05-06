import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type AuditActorKind = 'user' | 'agent' | 'system';
export const AUDIT_ACTOR_KINDS: AuditActorKind[] = ['user', 'agent', 'system'];

/** Per ADR-AUDIT-SCHEMA: snippet capped at 500 chars (matches ai_suggestions). */
export const AUDIT_SNIPPET_MAX = 500;

/** Reason capped at 2000 chars (matches DB CHECK in migration 0017). */
export const AUDIT_REASON_MAX = 2000;

/** event_type capped at 100 chars (matches DB CHECK). */
export const AUDIT_EVENT_TYPE_MAX = 100;

/** aggregate_type capped at 50 chars (matches DB CHECK). */
export const AUDIT_AGGREGATE_TYPE_MAX = 50;

@Entity({ name: 'audit_log' })
@Index('ix_audit_log_aggregate', [
  'organizationId',
  'aggregateType',
  'aggregateId',
  'createdAt',
])
@Index('ix_audit_log_event_type', ['organizationId', 'eventType', 'createdAt'])
export class AuditLog {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null = null;

  @Column({ name: 'actor_kind', type: 'text' })
  actorKind!: AuditActorKind;

  @Column({ name: 'agent_name', type: 'text', nullable: true })
  agentName: string | null = null;

  @Column({ name: 'payload_before', type: 'jsonb', nullable: true })
  payloadBefore: unknown = null;

  @Column({ name: 'payload_after', type: 'jsonb', nullable: true })
  payloadAfter: unknown = null;

  @Column({ type: 'text', nullable: true })
  reason: string | null = null;

  @Column({ name: 'citation_url', type: 'text', nullable: true })
  citationUrl: string | null = null;

  @Column({ type: 'text', nullable: true })
  snippet: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
