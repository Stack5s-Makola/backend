import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Seller } from '../../sellers/entities/seller.entity';
import { Category } from '../../categories/entities/Categories.entity';
import { Subcategory } from '../../categories/entities/SubCategory.entity';
import type { ListingApprovalStatus } from '../../common/constants/domain';

@Entity()
export class Product {
  // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @ManyToOne(() => Seller, (seller) => seller.products)
  seller!: Seller;

  @ManyToOne(() => Category, { nullable: true })
  category!: Category;

  @ManyToOne(() => Subcategory, { nullable: true })
  subcategory!: Subcategory;

  // New listings wait for an admin before buyers can see them
  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  approvalStatus!: ListingApprovalStatus;

  // Why an admin rejected or removed it; cleared again on approval
  @Column({ type: 'text', nullable: true })
  moderationNote!: string | null;

  // The admin who last approved, rejected or removed it, and when
  @Column({ type: 'uuid', nullable: true })
  moderatedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  moderatedAt!: Date | null;

  // Deliberately NOT a @Column: `product` has no image column yet, and
  // declaring one puts it in every query against this table. Declared so the
  // admin listings table can read it once a migration adds it - see
  // documentation/pending-profile-fields.md.

  /** The listing's photo, as a Cloudinary URL like the uploads module returns. */
  imageUrl?: string;

  /**
   * Words a seller attaches to help shoppers find the listing.
   *
   * Same story: no `tags` column exists, so nothing is stored and every
   * product reads as an empty list. Anything written here is dropped.
   * Buyer search covers the name and the category instead - it can include
   * tags the day the column is real.
   */
  tags?: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
