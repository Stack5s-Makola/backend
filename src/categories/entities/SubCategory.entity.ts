import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Category } from './Categories.entity';

@Entity('subcategories')
export class Subcategory {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    name!: string;

    @Column({ nullable: true })
    description?: string;

    @ManyToOne(() => Category, category => category.subcategories, {onDelete: 'CASCADE'})
    category!: Category;
}