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

    // Deliberately NOT a @Column: the database has no such column yet, and
    // declaring one puts it in every query against this table, which breaks
    // POST /api/users and the admin user endpoints. The auth module reads it,
    // so it stays declared. See documentation/pending-auth-schema.md before
    // adding the decorator back.
    emailVerified?: boolean;
}