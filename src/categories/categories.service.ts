import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/Categories.entity';
import { Subcategory } from './entities/SubCategory.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(Category)
        private categoriesRepository: Repository<Category>,
        @InjectRepository(Subcategory)
        private subcategoriesRepository: Repository<Subcategory>,
    ) {}

    async createCategory(createCategoryDto: CreateCategoryDto): Promise<Category> {
        const category = this.categoriesRepository.create(createCategoryDto);
        return this.categoriesRepository.save(category);
    }

    async findAllCategories(): Promise<Category[]> {
        return this.categoriesRepository.find({ relations: ['subcategories'] });
    }

    async findOneCategory(id: string): Promise<Category> {
        const category = await this.categoriesRepository.findOne({
            where: { id },
            relations: ['subcategories'],
        });
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return category;
    }

    async updateCategory(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
        await this.categoriesRepository.update(id, updateCategoryDto);
        return this.findOneCategory(id);
    }

    async removeCategory(id: string): Promise<void> {
        await this.categoriesRepository.delete(id);
    }

    async createSubcategory(createSubcategoryDto: CreateSubcategoryDto): Promise<Subcategory> {
        const category = await this.findOneCategory(createSubcategoryDto.categoryId);
        const subcategory = this.subcategoriesRepository.create({
            ...createSubcategoryDto,
            category,
        });
        return this.subcategoriesRepository.save(subcategory);
    }

    async updateSubcategory(id: string, updateSubcategoryDto: UpdateSubcategoryDto): Promise<Subcategory> {
        await this.subcategoriesRepository.update(id, updateSubcategoryDto);
        const subcategory = await this.subcategoriesRepository.findOne({
            where: { id },
            relations: ['category'],
        });
        if (!subcategory) {
            throw new NotFoundException('Subcategory not found');
        }
        return subcategory;
    }

    async removeSubcategory(id: string): Promise<void> {
        await this.subcategoriesRepository.delete(id);
    }
}