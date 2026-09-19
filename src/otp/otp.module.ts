import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { Otp } from './entities/Otp.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Otp]), EmailModule],
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
