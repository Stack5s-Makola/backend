import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ResetPasswordDto } from './dto';
import { PasswordService } from './password.service';

/** POST /api/reset-password - set a new password on an account. */
@Controller()
export class PasswordController {
  constructor(private readonly password: PasswordService) {}

  // 200 rather than the 201 Nest gives POST by default: nothing is created.
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Body() body: ResetPasswordDto) {
    return this.password.reset(body);
  }
}
