import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  phone!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: 'buyer' })
  role!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ default: 'active' })
  status!: string;

  // The column exists in the database now, so this is persisted again. It
  // goes true when a verification code is accepted.
  @Column({ default: false })
  emailVerified!: boolean;

  // Declared so the admin sellers and users tables can read them, but with no
  // @Column, because `users` has neither column yet. They stay undefined
  // until a migration adds them - see documentation/pending-profile-fields.md.

  /** The person's display name, shown in the admin tables. */
  @Column({ nullable: true })
  fullName?: string;

  /** Their avatar, stored as a Cloudinary URL like the uploads module returns. */
  @Column({ nullable: true })
  avatarUrl?: string;

  // Where the person is. Sellers keep their shop's position on the seller
  // row; this is the account holder's own, which is what a buyer has.

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: number;

  /**
   * What those coordinates resolve to, from Mapbox.
   *
   * Stored alongside them, not instead: this is what the profile screen
   * shows, while the coordinates are what any distance maths would use.
   */
  @Column({ nullable: true })
  locationName?: string;
}
