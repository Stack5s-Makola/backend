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

    async getUserByEmail(email: string) {
        return {
            message: `Fetching user by email ${email}`,
        }
    }

    async getUserByPhone(phone: string) {
        return {
            message: `Fetching user by phone ${phone}`,
        }
    }

    async updateUser(id: string, updateUserDto: any) {
        return {
            message: `Updating user with ID: ${id}`,
            data: updateUserDto
        }
    }

    async deleteUser(id: string) {
        return {
            message: `User with ID: ${id} successfully deleted`
        }
    }

    async searchUsers(query: string) {
        return {
            message: `Searching users with query: ${query}`
        }
    }

    async changeUserStatus(id: string, status: string) {
        return {
            message: `Changed user ${id} status to ${status}`
        }
    }
}