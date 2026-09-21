import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginDto } from './dto';
import { LoginService } from './login.service';

/** POST /api/login - the mobile app's sign in. */
@Controller()
export class LoginController {
  constructor(private readonly login: LoginService) {}

  // 200 rather than the 201 Nest gives POST by default: nothing is created.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() body: LoginDto) {
    return this.login.login(body);
  }
}
