import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto';

/**
 * Admin routes.
 *
 * Only login exists so far; everything else is being rebuilt on top of it.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 200 rather than the 201 Nest gives POST by default: nothing is created.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: AdminLoginDto) {
    return this.adminService.login(body);
  }
}
