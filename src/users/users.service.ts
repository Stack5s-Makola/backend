import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
    async createUser(createUserDto: any) {
        return {
            message: 'User successfully created',
            data: createUserDto
        }
    }
    
    async getUserById() {}
    async getUserByEmail() {}
    async getUserByPhone() {}
    async updateUser() {}
    async deleteUser() {}
    async searchUsers() {}
    async changeUserStatus() {}
}