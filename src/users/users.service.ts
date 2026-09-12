import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) {}

    async createUser(createUserDto: CreateUserDto): Promise<User> {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(createUserDto.passwordHash as string, saltRounds);

        const newUser = this.usersRepository.create({
            ...createUserDto,
            passwordHash: hashedPassword,
        });
        
        return this.usersRepository.save(newUser);
    }

    async getUserById(id: string): Promise<User | null> {
        return this.usersRepository.findOne({
            where: {id}
        });
    }

    async getUserByEmail(email: string) {
        return this.usersRepository.findOne({
            where: {email}
        });
    }

    async getUserByPhone(phone: string) {
        return this.usersRepository.findOne({
            where: {phone}
        });
    }

    async updateUser(id: string, updateUserDto: Partial<User>) {
        await this.usersRepository.update(id, updateUserDto);
        return this.getUserById(id);
    }

    async deleteUser(id: string) {
        return this.usersRepository.delete(id);
    }

    async searchUsers(query: string) {
        return this.usersRepository.find({
            where: { email: ILike(`%${query}%`)}
        });
    }

    async changeUserStatus(id: string, status: string) {
        await this.usersRepository.update(id, {status});
        return this.getUserById(id);
    }
}