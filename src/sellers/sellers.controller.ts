import { Controller, Get, Post, Put, Patch, Param, Body, Query, } from '@nestjs/common';
import { SellersService } from './sellers.service';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post()
  async createSellerProfile(@Body() createSellerDto: any) {
    return this.sellersService.createSellerProfile(createSellerDto);
  }

  @Get('search')
  async searchSellers(@Query('q') query: string) {
    return this.sellersService.searchSellers(query);
  }

  @Get('nearby')
  async getNearbySellers(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.sellersService.getNearbySellers(lat, lng);
  }

  @Get('user/:userId')
  async getSellerByUserId(@Param('userId') userId: string) {
    return this.sellersService.getSellerByUserId(userId);
  }

  @Get(':id')
  async getSellerById(@Param('id') id: string) {
    return this.sellersService.getSellerById(id)
  }

  @Get(':id/products')
  async getSellerProducts(@Param('id') id: string) {
    return this.sellersService.getSellerProducts(id);
  }

  @Put(':id')
  async updateSellerProfile(@Param('id') id: string, @Body() updateSellerDto: any) {
    return this.sellersService.updateSellerProfile(id, updateSellerDto)
  }

  @Patch(':id/verify')
  async updateVerificationStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.sellersService.updateVerificationStatus(id, status);
  }
}