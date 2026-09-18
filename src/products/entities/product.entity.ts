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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
