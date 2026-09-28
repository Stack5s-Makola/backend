import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  AddProductDto,
  NearbySellersDto,
  ShopProductsDto,
  UpdateLocationDto,
  UpdatePhoneDto,
  UpdateShopNameDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';
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
  constructor(
    private readonly seller: SellerService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * GET /api/seller/notifications - the bell screen, newest first.
   *
   * ?unread=true narrows it to the ones not yet opened.
   */
  @Get('notifications')
  notifications_(
    @CurrentUser() user: JwtPayload,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.listFor(user.sub, unread === 'true');
  }

  /** GET /api/seller/notifications/unread-count - the badge on the bell. */
  @Get('notifications/unread-count')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadCountFor(user.sub);
  }

  /** PATCH /api/seller/notifications/read-all - clear the badge. */
  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  /** PATCH /api/seller/notifications/:id/read - open one. */
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.sub, id);
  }

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

  /**
   * GET /api/seller/shops/nearby?radiusKm=25 - other shops around this one.
   *
   * Declared before /shop so it is never read as a status query. Takes
   * optional latitude and longitude to look somewhere other than home.
   */
  @Get('shops/nearby')
  nearbySellers(
    @CurrentUser() user: JwtPayload,
    @Query() query: NearbySellersDto,
  ) {
    return this.seller.nearbySellers(user.sub, query);
  }

  /** GET /api/seller/me - the seller's account and shop. */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.seller.me(user.sub);
  }

  /**
   * POST /api/seller/me/update/profile-picture - replace the picture.
   *
   * Multipart with an `image` field. Sets both the account's avatar and the
   * shop's logo, so every screen picks it up.
   */
  @Post('me/update/profile-picture')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  updateProfilePicture(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.seller.updateProfilePicture(user.sub, image);
  }

  /** POST /api/seller/me/update/shop-name - rename the shop. */
  @Post('me/update/shop-name')
  @HttpCode(HttpStatus.OK)
  updateShopName(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateShopNameDto,
  ) {
    return this.seller.updateShopName(user.sub, body);
  }

  /** POST /api/seller/me/update/location - move the shop. */
  @Post('me/update/location')
  @HttpCode(HttpStatus.OK)
  updateLocation(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateLocationDto,
  ) {
    return this.seller.updateLocation(user.sub, body);
  }

  /** POST /api/seller/me/update/phone - change the account's phone number. */
  @Post('me/update/phone')
  @HttpCode(HttpStatus.OK)
  updatePhone(@CurrentUser() user: JwtPayload, @Body() body: UpdatePhoneDto) {
    return this.seller.updatePhone(user.sub, body);
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

  /**
   * DELETE /api/seller/products/:id - take one of your own listings down.
   *
   * Whose shop comes from the token, so this can only ever delete a listing
   * belonging to the caller. Anything else is a 404.
   */
  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.seller.deleteProduct(user.sub, id);
  }
}
