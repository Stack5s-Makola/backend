import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** What a code was issued for. A code is only valid for its own purpose. */
export type OtpPurpose = 'email_verification' | 'password_reset' | 'login';
export const OTP_PURPOSES: OtpPurpose[] = [
  'email_verification',
  'password_reset',
  'login',
];

/**
 * A one-time code sent to an email address.
 *
 * The code itself is never stored: only a bcrypt hash of it, the same way
 * passwords are handled, so a leaked table cannot be replayed. Rows are kept
 * after use — `consumedAt` marks a spent code — because the attempt history
 * is what makes throttling possible.
 *
 * Keyed by email rather than userId so a code can be issued before the user
 * row exists, and so password reset works for an address alone.
 */
@Entity('otps')
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column()
  email!: string;

  @Column()
  codeHash!: string;

  @Column({ default: 'email_verification' })
  purpose!: OtpPurpose;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  /** Wrong guesses so far; the code dies once this reaches the maximum. */
  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
