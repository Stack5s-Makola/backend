import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ReportStatus } from '../../common/constants/domain';

/**
 * A buyer flagging a listing or a seller for an admin to look at.
 *
 * Follows the reports entity in the architecture document. References are
 * plain uuid columns, matching how Seller stores `userId`.
 */
@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  reporterId!: string;

  // A report targets a listing, a seller, or both
  @Column({ type: 'uuid', nullable: true })
  productId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  sellerId!: string | null;

  @Column()
  reason!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status!: ReportStatus;

  // The admin who acted on it, and when
  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
