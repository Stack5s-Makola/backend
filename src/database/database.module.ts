import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';

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
        synchronize: false,
        entities: [Product],
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}