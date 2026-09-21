import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { RegisterController } from './register.controller';
import { RegisterService } from './register.service';

@Module({
  imports: [OtpModule],
  controllers: [RegisterController],
  providers: [RegisterService],
})
export class RegisterModule {}
