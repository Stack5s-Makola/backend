import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { OneToMany } from 'typeorm';

@Entity('sellers')
export class Seller {

  // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({unique: true})
  shopName!: string;

  @Column({nullable: true})
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({default: 'pending'})
  verificationStatus!: string;

  @OneToMany(() => Product, product => product.seller)
  products!: Product[];
}