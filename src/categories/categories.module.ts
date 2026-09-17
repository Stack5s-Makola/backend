import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Category } from './entities/Categories.entity';
import { Subcategory } from './entities/SubCategory.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Subcategory])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})

export class CategoriesModule {}