import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedService } from './saved.service';
import { SavedController } from './saved.controller';
import { SavedProduct } from './entities/SavedProduct.entity';
import { SavedSeller } from './entities/SavedSeller.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedProduct, SavedSeller])],
  controllers: [SavedController],
  providers: [SavedService],
})
export class SavedModule {}