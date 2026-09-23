import { Module } from '@nestjs/common';
import { SessionTokenModule } from '../common/session-token.module';
import { OtpModule } from '../otp/otp.module';
import { UploadsModule } from '../uploads/uploads.module';
import { RegisterController } from './register.controller';
import { RegisterService } from './register.service';

@Module({
  imports: [OtpModule, SessionTokenModule, UploadsModule],
  controllers: [RegisterController],
  providers: [RegisterService],
})
export class RegisterModule {}
