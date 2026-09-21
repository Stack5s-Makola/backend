import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionTokenModule } from '../common/session-token.module';
import { OtpModule } from '../otp/otp.module';
import { User } from '../users/entities/user.entity';
import { LoginController } from './login.controller';
import { LoginService } from './login.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), OtpModule, SessionTokenModule],
  controllers: [LoginController],
  providers: [LoginService],
})
export class LoginModule {}
