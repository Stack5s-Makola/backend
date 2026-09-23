import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { BuyersService } from './buyers.service';
import { DashboardService } from './dashboard.service';
import { ListingsService } from './listings.service';
import { SellersService } from './sellers.service';
import { AdminLoginDto } from './dto';

/**
 * Admin routes.
 *
 * Login is open; everything after it needs the access token login hands back,
 * sent as `Authorization: Bearer <token>`.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly dashboard: DashboardService,
    private readonly sellers: SellersService,
    private readonly buyers: BuyersService,
    private readonly listings: ListingsService,
  ) {}

  // 200 rather than the 201 Nest gives POST by default: nothing is created.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: AdminLoginDto) {
    return this.adminService.login(body);
  }

  // JwtAuthGuard first: it puts the verified payload on the request that
  // RolesGuard then reads the role from.
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  dashboardTotals() {
    return this.dashboard.totals();
  }

  @Get('sellers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listSellers() {
    return this.sellers.list();
  }

  @Get('buyers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listBuyers() {
    return this.buyers.list();
  }

  @Get('listings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listListings() {
    return this.listings.list();
  }

  /**
   * PATCH /api/admin/listings/:id/approve - let buyers see a listing.
   *
   * Until this runs, a seller's product exists but appears nowhere a shopper
   * looks.
   */
  @Patch('listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approveListing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.listings.approve(id, admin.sub);
  }
}
