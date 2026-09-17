import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Get()
  findAllCategories() {
    return this.categoriesService.findAllCategories();
  }

  @Get(':id')
  findOneCategory(@Param('id') id: string) {
    return this.categoriesService.findOneCategory(id);
  }

  @Patch(':id')
  updateCategory(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  removeCategory(@Param('id') id: string) {
    return this.categoriesService.removeCategory(id);
  }

  @Post('subcategories')
  createSubcategory(@Body() createSubcategoryDto: CreateSubcategoryDto) {
    return this.categoriesService.createSubcategory(createSubcategoryDto);
  }

  @Patch('subcategories/:id')
  updateSubcategory(@Param('id') id: string, @Body() updateSubcategoryDto: UpdateSubcategoryDto) {
    return this.categoriesService.updateSubcategory(id, updateSubcategoryDto);
  }

  @Delete('subcategories/:id')
  removeSubcategory(@Param('id') id: string) {
    return this.categoriesService.removeSubcategory(id);
  }
}