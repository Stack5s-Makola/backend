import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import {
  ListReportsDto,
  ListUsersDto,
  PaginationDto,
  SearchUsersDto,
  UpdateUserStatusDto,
} from './dto';

/**
 * Admin API.
 *
 * Every route below is admin-only, per the authorization section of the
 * architecture document: a valid access token is required and its `role`
 * claim must be ADMIN.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Dashboard
  @Get('/dashboard')
  dashboard() {
    return this.adminService.getDashboard();
  }

  // User Management
  @Get('/users')
  getUsers(@Query() query: ListUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Get('/users/search')
  searchUser(@Query() query: SearchUsersDto) {
    return this.adminService.searchUsers(query);
  }

  @Get('/users/:id')
  getOneUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('/users/:id/status')
  @HttpCode(HttpStatus.OK)
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserStatusDto,
    @CurrentUser() admin?: JwtPayload,
  ) {
    return this.adminService.updateUserStatus(id, body.status, admin?.sub);
  }

  // Buyer Management
  @Get('/buyers')
  getBuyers(@Query() query: PaginationDto) {
    return this.adminService.listBuyers(query);
  }

  @Get('/buyers/:id')
  getOneBuyer(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getBuyer(id);
  }

  // Seller Management
  @Get('/sellers')
  getSellers(@Query() query: PaginationDto) {
    return this.adminService.listSellers(query);
  }

  @Get('/sellers/pending')
  getPendingSellers(@Query() query: PaginationDto) {
    return this.adminService.listPendingSellers(query);
  }

  @Get('/sellers/:id')
  getOneSeller(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getSeller(id);
  }

  @Patch('/sellers/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveSeller(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveSeller(id);
  }

  @Patch('/sellers/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectSeller(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectSeller(id);
  }

  // Listing Management
  @Get('/listings')
  getListings(@Query() query: PaginationDto) {
    return this.adminService.listListings(query);
  }

  @Get('/listings/pending')
  getPendingListings(@Query() query: PaginationDto) {
    return this.adminService.listPendingListings(query);
  }

  @Get('/listings/:id')
  getOneListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getListing(id);
  }

  @Patch('/listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveListing(id);
  }

  @Patch('/listings/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.rejectListing(id);
  }

  @Patch('/listings/:id/remove')
  @HttpCode(HttpStatus.OK)
  removeListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.removeListing(id);
  }

  // Report Management
  @Get('/reports')
  getReports(@Query() query: ListReportsDto) {
    return this.adminService.listReports(query);
  }

  @Patch('/reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin?: JwtPayload,
  ) {
    return this.adminService.resolveReport(id, admin?.sub);
  }

  @Patch('/reports/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismissReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin?: JwtPayload,
  ) {
    return this.adminService.dismissReport(id, admin?.sub);
  }
}
