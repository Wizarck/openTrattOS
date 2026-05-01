import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UserLocationCreateProps {
  userId: string;
  locationId: string;
}

@Entity({ name: 'user_locations' })
@Index('uq_user_locations_user_location', ['userId', 'locationId'], { unique: true })
@Index('ix_user_locations_user_id', ['userId'])
@Index('ix_user_locations_location_id', ['locationId'])
export class UserLocation {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  static create(props: UserLocationCreateProps): UserLocation {
    UserLocation.validateUuid('userId', props.userId);
    UserLocation.validateUuid('locationId', props.locationId);
    const ul = new UserLocation();
    ul.id = randomUUID();
    ul.userId = props.userId;
    ul.locationId = props.locationId;
    return ul;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`UserLocation.${field} must be a UUID; got "${value}"`);
    }
  }
}
