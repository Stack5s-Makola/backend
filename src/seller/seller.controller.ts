import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../common/guards/jwt-auth.guard';
import { AddProductDto, ShopProductsDto } from './dto';
import { SellerService } from './seller.service';
import type { UploadedImage } from './seller.service';

/**
 * The seller side of the mobile app.
 *
 * Every route needs a token, and which shop it acts on comes from that token
 * - never from a parameter, so one seller cannot touch another's listings.
 *
 * No @Roles('SELLER'): the shop row is the real check. An account with a shop
 * gets through whatever its role says, and one without gets a 403 either way.
 */
@Controller('seller')
@UseGuards(JwtAuthGuard)
export class SellerController {
  constructor(private readonly seller: SellerService) {}

  /** GET /api/seller/dashboard - name, avatar, counts, 5 newest listings. */
  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.seller.dashboard(user.sub);
  }

  /** GET /api/seller/shop?status=approved - the seller's own listings. */
  @Get('shop')
  shop(@CurrentUser() user: JwtPayload, @Query() query: ShopProductsDto) {
    return this.seller.shop(user.sub, query);
  }

  /** GET /api/seller/me - the seller's account and shop. */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.seller.me(user.sub);
  }

  /**
   * POST /api/seller/add - list a product.
   *
   * JSON, or multipart with an `image` field.
   */
  @Post('add')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  add(
    @CurrentUser() user: JwtPayload,
    @Body() body: AddProductDto,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.seller.addProduct(user.sub, body, image);
  }
}
