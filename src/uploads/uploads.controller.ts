import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) { }

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))

  async uploadImage(@UploadedFile() file: any) {
    return this.uploadsService.uploadImage(file);
  }
}
