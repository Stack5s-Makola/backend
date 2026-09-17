import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryProvider } from './cloudinary.provider';

@Module({
  controllers: [UploadsController],
  providers: [CloudinaryProvider, UploadsService],
  exports: [CloudinaryProvider, UploadsService],
})
export class UploadsModule {}
