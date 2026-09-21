import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// Auth and OTP are switched off until their schema exists:
// see documentation/pending-auth-schema.md
// import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SellersModule } from './sellers/sellers.module';
import { ListingsModule } from './listings/listings.module';
import { CategoriesModule } from './categories/categories.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SavedModule } from './saved/saved.module';
import { SearchModule } from './search/search.module';
import { SyncModule } from './sync/sync.module';
import { AdminModule } from './admin/admin.module';
import { UploadsModule } from './uploads/uploads.module';
import { EmailModule } from './email/email.module';
import { OtpModule } from './otp/otp.module';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { ProductsModule } from './products/products.module';
import { RegisterModule } from './register/register.module';
import { LoginModule } from './login/login.module';
import { PasswordModule } from './password/password.module';

@Module({
  imports: [
    // AuthModule,
    UsersModule,
    SellersModule,
    ListingsModule,
    CategoriesModule,
    ReviewsModule,
    SavedModule,
    SearchModule,
    SyncModule,
    AdminModule,
    UploadsModule,
    EmailModule,
    OtpModule,
    DatabaseModule,
    CommonModule,
    ProductsModule,
    RegisterModule,
    LoginModule,
    PasswordModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
