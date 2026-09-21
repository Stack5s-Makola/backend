import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

/**
 * A JwtService that signs tokens which never expire.
 *
 * CommonModule registers JwtModule globally with JWT_ACCESS_EXPIRES_IN, which
 * is what the admin dashboard wants: a short session on a browser someone may
 * walk away from. The mobile app is the opposite case - the app holds the
 * token in its own storage and there is no refresh endpoint for it to call,
 * so an expiry would log people out with no way back in but the password.
 *
 * Importing this module into a feature module shadows the global JwtService
 * for that module's providers, and no signOptions means no `exp` claim.
 *
 * The trade is real: a token with no expiry is valid until JWT_SECRET
 * changes. There is nothing to revoke it, so a stolen one stays good. The
 * refresh_tokens table exists if that ever needs fixing properly.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  exports: [JwtModule],
})
export class SessionTokenModule {}
