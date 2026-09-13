import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Seller } from '../../sellers/entities/seller.entity';

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
}