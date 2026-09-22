import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../common/guards/jwt-auth.guard';
import { BuyerService } from './buyer.service';
import { BrowseProductsDto, SearchProductsDto } from './dto';

/** The mobile app's shopping screens. Every route needs a signed-in account. */
@Controller('buyer')
@UseGuards(JwtAuthGuard)
export class BuyerController {
  constructor(private readonly buyer: BuyerService) {}

  /**
   * GET /api/buyer/products/search?q=kente - free text search.
   *
   * Declared before /products so Nest does not read "search" as a product id
   * if an :id route is ever added below.
   */
  @Get('products/search')
  search(@Query() query: SearchProductsDto) {
    return this.buyer.search(query);
  }

  /**
   * GET /api/buyer/products - the home page.
   *
   * Takes ?category= to narrow to one category, and the coordinates to sort
   * and filter by distance.
   *
   * No @Roles: a seller browsing the app is still a shopper. The guard only
   * asks that the caller is signed in.
   */
  @Get('products')
  browse(@Query() query: BrowseProductsDto) {
    return this.buyer.browse(query);
  }

  /**
   * GET /api/buyer/saved/products - everything this buyer saved, in full.
   *
   * Whose saves to return comes from the token, never a parameter: a buyer
   * can only ever read their own.
   */
  @Get('saved/products')
  savedProducts(@CurrentUser() user: JwtPayload) {
    return this.buyer.savedProductsFor(user.sub);
  }

  /** GET /api/buyer/saved/shops - the shops this buyer saved. */
  @Get('saved/shops')
  savedShops(@CurrentUser() user: JwtPayload) {
    return this.buyer.savedShopsFor(user.sub);
  }

  /** GET /api/buyer/my-profile - the name and picture on the profile screen. */
  @Get('my-profile')
  profile(@CurrentUser() user: JwtPayload) {
    return this.buyer.profile(user.sub);
  }

  /** GET /api/buyer/my-profile/personal-details - the whole account. */
  @Get('my-profile/personal-details')
  personalDetails(@CurrentUser() user: JwtPayload) {
    return this.buyer.personalDetails(user.sub);
  }

  /**
   * GET /api/buyer/products/:id - the product page.
   *
   * Last, so "search" is never read as an id. ParseUUIDPipe turns a
   * malformed id into a 400 rather than letting it reach the database.
   */
  @Get('products/:id')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.buyer.product(id);
  }
}
