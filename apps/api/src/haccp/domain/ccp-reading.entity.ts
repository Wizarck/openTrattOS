import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM returns numeric columns as strings (postgres protocol); convert to
 * JS number for application code while accepting number-typed values on the
 * way back to the DB.
 */
const numericTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number.parseFloat(value),
};

/**
 * `haccp_ccp_readings` row. One per recorded CCP value. Tenant-scoped + soft-delete
 * (`deleted_at` nullable per ADR-009). Pins the FSMS standard version active
 * at write time so two-years-out audits can reconstruct spec ranges.
 *
 * `reading_value` is nullable to allow `checkbox` / `multi-select` CCPs which
 * carry their payload in `reading_extras` JSONB instead. For `numeric` /
 * `range` CCPs the value is required.
 *
 * The DB CHECK constraint `haccp_readings_corrective_when_out_of_spec`
 * mirrors the service-layer gate: `in_spec = true OR corrective_action_id
 * IS NOT NULL`. See migration 0034 + design.md Decision C.
 */
@Entity({ name: 'haccp_ccp_readings' })
@Index('idx_haccp_readings_org_ccp_created', [
  'organizationId',
  'ccpId',
  'createdAt',
])
@Index('idx_haccp_readings_org_fsms_created', [
  'organizationId',
  'fsmsStandardId',
  'createdAt',
])
export class CcpReading {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'fsms_standard_id', type: 'uuid' })
  fsmsStandardId!: string;

  @Column({ name: 'fsms_standard_version', type: 'text' })
  fsmsStandardVersion!: string;

  @Column({ name: 'ccp_id', type: 'text' })
  ccpId!: string;

  @Column({
    name: 'reading_value',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  readingValue: number | null = null;

  @Column({ name: 'reading_unit', type: 'text', nullable: true })
  readingUnit: string | null = null;

  @Column({ name: 'reading_extras', type: 'jsonb', nullable: true })
  readingExtras: Record<string, unknown> | null = null;

  @Column({
    name: 'spec_min',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  specMin: number | null = null;

  @Column({
    name: 'spec_max',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  specMax: number | null = null;

  @Column({ name: 'in_spec', type: 'boolean' })
  inSpec!: boolean;

  @Column({ name: 'corrective_action_id', type: 'uuid', nullable: true })
  correctiveActionId: string | null = null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null = null;
}
