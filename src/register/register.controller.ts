import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegisterBuyerDto, SetSellerProfileDto } from './dto';
import { RegisterService } from './register.service';
import type { UploadedImage } from './register.service';

/** Sign-up steps the mobile app walks through after creating an account. */
@Controller('register')
export class RegisterController {
  constructor(private readonly register: RegisterService) {}

  /**
   * Takes JSON, or multipart with an optional `image` field.
   *
   * FileInterceptor leaves a JSON request untouched, so the older clients
   * that post JSON keep working exactly as before.
   */
  @Post('set-seller-profile')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  setSellerProfile(
    @Body() body: SetSellerProfileDto,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.register.setSellerProfile(body, image);
  }

  /** POST /api/register/buyer - an account on its own, with no shop. */
  @Post('buyer')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  registerBuyer(
    @Body() body: RegisterBuyerDto,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.register.registerBuyer(body, image);
  }
}
