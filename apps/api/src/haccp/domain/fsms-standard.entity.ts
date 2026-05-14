import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { CcpDefinition } from '../types';

/**
 * `fsms_standards` row. One per (organization, name, version) tuple. The
 * `effective_from` / `effective_until` pair defines the time window during
 * which the standard is the active one for that name; the `(name, version)`
 * pair is unique per tenant per the migration's UNIQUE constraint.
 *
 * `ccp_definitions` JSONB carries the inline CCP definitions per design.md
 * Decision A — CCPs are JSONB-defined children of the standard, NOT a
 * separate `ccps` table.
 */
@Entity({ name: 'fsms_standards' })
@Index('idx_fsms_standards_org_name_effective_from', [
  'organizationId',
  'name',
  'effectiveFrom',
])
export class FsmsStandard {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  version!: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil: Date | null = null;

  @Column({ name: 'ccp_definitions', type: 'jsonb' })
  ccpDefinitions!: CcpDefinition[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
