import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {

    // the ! is neccessary to let the compiler to forget the missing initial values since typeScript expect every propertyto have initial values

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({unique: true})
    email!: string;

    @Column({nullable: true})
    phone!: string;

    @Column()
    passwordHash!: string;

    @Column({default: 'buyer'})
    role!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({default: 'active'})
    status!: string;

    // Set by POST /api/auth/verify-otp; login refuses an unverified account
    @Column({default: false})
    emailVerified!: boolean;
}