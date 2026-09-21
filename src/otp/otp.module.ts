import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { User } from '../users/entities/user.entity';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { VerifyOtpController } from './verify-otp.controller';
import { VerificationService } from './verification.service';
import { Otp } from './entities/Otp.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Otp, User]), EmailModule],
  controllers: [OtpController, VerifyOtpController],
  providers: [OtpService, VerificationService],
  exports: [OtpService],
})
export class OtpModule {}
