import { Entity, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('saved_products')
export class SavedProduct {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ManyToOne(() => User)
    user!: User;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    product!: Product;
}