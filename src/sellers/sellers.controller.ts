import { Controller, Get, Post, Put, Param, Body } from '@nestjs/common';
import { SellersService } from './sellers.service';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post()
  createSellerProfile() {}

  @Get(':id')
  getSellerById() {}

  @Put(':id')
  updateSellerProfile() {}
}