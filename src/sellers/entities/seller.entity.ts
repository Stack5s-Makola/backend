import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { OneToMany } from 'typeorm';

@Entity('sellers')
export class Seller {
  // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ unique: true })
  shopName!: string;

  @Column({ nullable: true })
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ default: 'pending' })
  verificationStatus!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: number;

  /**
   * The place the coordinates resolve to, from Mapbox.
   *
   * Kept alongside the coordinates, not instead of them: this is what people
   * read, while latitude and longitude are what nearby search and distance
   * sorting are computed from. Null when Mapbox knew nothing about the spot,
   * or was unreachable when the shop was created.
   */
  @Column({ nullable: true })
  locationName?: string;

  // Deliberately NOT a @Column: `sellers` has no such column yet, and
  // declaring one puts it in every query against this table. Declared so the
  // admin sellers table can read it once a migration adds it - see
  // documentation/pending-profile-fields.md.

  /** The shop's own logo, shown in the admin sellers table ahead of the owner's avatar. */
  @Column({ nullable: true })
  logoUrl?: string;

  @OneToMany(() => Product, (product) => product.seller)
  products!: Product[];
}
