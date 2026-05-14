import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * `haccp_corrective_actions` row. Two creation modes per design.md Decision D:
 *  - Predefined (created by Owner via `POST /m3/haccp/corrective-actions`).
 *  - Ad-hoc (created inline by `recordReading()` when an out-of-spec value
 *    is submitted with `correctiveActionInput` instead of `correctiveActionId`).
 *
 * The `creation_mode` column lets the picker query show predefined first +
 * the 10 most-recent ad-hoc actions for the CCP. The `audit_log` envelope
 * (`CCP_CORRECTIVE_ACTION_RECORDED`) also carries this in `payload_after`.
 */
@Entity({ name: 'haccp_corrective_actions' })
@Index('idx_haccp_corrective_actions_org_fsms_ccp', [
  'organizationId',
  'fsmsStandardId',
  'ccpId',
])
export class CorrectiveAction {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'fsms_standard_id', type: 'uuid' })
  fsmsStandardId!: string;

  @Column({ name: 'ccp_id', type: 'text' })
  ccpId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null = null;

  @Column({ name: 'creation_mode', type: 'text' })
  creationMode!: 'predefined' | 'ad-hoc';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null = null;
}
