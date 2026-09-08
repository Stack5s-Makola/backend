import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser() {}

  @Get(':id')
  getUserById() {}

  @Put(':id')
  updateUser() {}

  @Delete(':id')
  deleteUser() {}
}