import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** What a notification is about. The app decides where each one navigates. */
export type NotificationType =
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_removed'
  | 'shop_verified';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'listing_approved',
  'listing_rejected',
  'listing_removed',
  'shop_verified',
];

/**
 * Something the app should tell someone about.
 *
 * Keyed by `userId`, not by shop, so the same table serves buyers when their
 * side needs one. Unread is `readAt IS NULL` rather than a boolean, so the
 * row also records when it was read.
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column()
  type!: NotificationType;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** The listing or shop it refers to, so the app can deep link. */
  @Column({ type: 'uuid', nullable: true })
  referenceId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
