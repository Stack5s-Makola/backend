import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        // TypeORM drops the URL query string, so Neon's sslmode=require is lost
        ssl: true,
        autoLoadEntities: true,
        // Automatically create tables if they do not exist (CREATE TABLE IF NOT EXISTS)
        synchronize: true,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        // Neon suspends an idle compute, so the first connection after a quiet
        // spell has to wait for it to wake. Without a longer timeout and a
        // few retries that cold start surfaces as a failed boot or a 500.
        retryAttempts: 5,
        retryDelay: 3000,
        extra: {
          max: 10,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 30000,
          keepAlive: true,
        },
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
