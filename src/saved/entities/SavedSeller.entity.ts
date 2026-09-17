import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Seller } from '../../sellers/entities/seller.entity';

@Entity('saved_sellers')
export class SavedSeller {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ManyToOne(() => User)
    user!: User;

    @ManyToOne(() => Seller, { onDelete: 'CASCADE' })
    seller!: Seller;
}