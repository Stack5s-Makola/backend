import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { SavedService } from './saved.service';
import { CreateSavedProductDto } from './dto/create-saved-product.dto';
import { CreateSavedSellerDto } from './dto/create-saved-seller.dto';

@Controller('saved')
export class SavedController {
  constructor(private readonly savedService: SavedService) {}

  @Post('products')
  saveProduct(@Body() dto: CreateSavedProductDto) {
    return this.savedService.saveProduct(dto);
  }

  @Get('products/:userId')
  getSavedProducts(@Param('userId') userId: string) {
    return this.savedService.getSavedProducts(userId);
  }

  @Delete('products/:id')
  removeSavedProduct(@Param('id') id: string) {
    return this.savedService.removeSavedProduct(id);
  }

  @Post('sellers')
  saveSeller(@Body() dto: CreateSavedSellerDto) {
    return this.savedService.saveSeller(dto);
  }

  @Get('sellers/:userId')
  getSavedSellers(@Param('userId') userId: string) {
    return this.savedService.getSavedSellers(userId);
  }

  @Delete('sellers/:id')
  removeSavedSeller(@Param('id') id: string) {
    return this.savedService.removeSavedSeller(id);
  }
}