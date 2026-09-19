import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A long-lived token that buys a fresh access token.
 *
 * The token itself is random, not a JWT, and only its SHA-256 digest is
 * stored: a digest can be looked up directly (unlike a bcrypt hash, which
 * would mean scanning every row), and the token carries enough entropy that
 * a fast hash is not a weakness.
 *
 * Rows are kept after use. `revokedAt` marks a spent or cancelled token, and
 * `replacedBy` chains a rotation to its successor, which is what lets the
 * service spot a stolen token being replayed.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column()
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** The token issued in this one's place when it was rotated. */
  @Column({ type: 'uuid', nullable: true })
  replacedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
