import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SetSellerProfileDto } from './dto';
import { RegisterService } from './register.service';

/** Sign-up steps the mobile app walks through after creating an account. */
@Controller('register')
export class RegisterController {
  constructor(private readonly register: RegisterService) {}

  @Post('set-seller-profile')
  @HttpCode(HttpStatus.OK)
  setSellerProfile(@Body() body: SetSellerProfileDto) {
    return this.register.setSellerProfile(body);
  }
}
