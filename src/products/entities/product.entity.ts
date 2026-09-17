import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Seller } from '../../sellers/entities/seller.entity';
import { Category } from '../../categories/entities/Categories.entity';
import { Subcategory } from '../../categories/entities/SubCategory.entity';

@Entity()
export class Product {

  // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @ManyToOne(() => Seller, seller => seller.products)
  seller!: Seller;

  @ManyToOne(() => Category, { nullable: true })
  category!: Category;

  @ManyToOne(() => Subcategory, { nullable: true })
  subcategory!: Subcategory;
}