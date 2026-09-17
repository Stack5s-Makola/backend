import { Controller, Get, Post, Put, Patch, Param, Body, Query, Delete } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { Seller } from './entities/seller.entity';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post()
  async createSellerProfile(@Body() createSellerDto: Partial<Seller>) {
    return this.sellersService.createSellerProfile(createSellerDto);
  }

  @Post()
  create(@Body() createSellerDto: CreateSellerDto) {
    return this.sellersService.create(createSellerDto);
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

  @Get()
  findAll() {
    return this.sellersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sellersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSellerDto: UpdateSellerDto) {
    return this.sellersService.update(id, updateSellerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sellersService.remove(id);
  }
}