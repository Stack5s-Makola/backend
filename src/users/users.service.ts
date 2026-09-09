import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
    async createUser(createUserDto: any) {
        return {
            message: 'User successfully created',
            data: createUserDto
        }
    }

    async getUserById(id: string) {
        return {
            message: `Fetching user by ID ${id}`,
            userId: id
        }
    }

    async getUserByEmail() {}
    async getUserByPhone() {}
    async updateUser() {}
    async deleteUser() {}
    async searchUsers() {}
    async changeUserStatus() {}
}