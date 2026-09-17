import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Seller } from '../sellers/entities/seller.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsFilterDto } from './dto/get-products-filter.dto';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private productsRepository: Repository<Product>,
        @InjectRepository(Seller)
        private sellersRepository: Repository<Seller>,
    ) {}

    async create(createProductDto: CreateProductDto): Promise<Product> {
        const seller = await this.sellersRepository.findOneBy({id: createProductDto.sellerId});
        if (!seller) {
            throw new NotFoundException('Seller not found');
        }

        const product = this.productsRepository.create({
            ...createProductDto,
            seller,
        });
        return this.productsRepository.save(product);
    }

    async findAllBySeller(sellerId: string): Promise<Product[]> {
        return this.productsRepository.find({
            where: { seller: { id: sellerId } },
            relations: ['seller'],
        });
    }

    async findOne(id: string): Promise<Product> {
        const product = await this.productsRepository.findOneBy({id});
        if (!product) {
            throw new NotFoundException('Product not found');
        }
        return product;
    }

    async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
        await this.productsRepository.update(id, updateProductDto);
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        await this.productsRepository.delete(id);
    }

    async findAll(filterDto: GetProductsFilterDto): Promise<Product[]> {
        const { search, categoryId, subcategoryId } = filterDto;
        const query = this.productsRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.seller', 'seller')
            .leftJoinAndSelect('product.category', 'category')
            .leftJoinAndSelect('product.subcategory', 'subcategory');

        if (search) {
            query.andWhere('LOWER(product.name) LIKE LOWER(:search)', {search: `%${search}%`});
        }

        if (categoryId) {
            query.andWhere('category.id = :categoryId', {categoryId});
        }

        if (subcategoryId) {
            query.andWhere('subcategory.id = :subcategoryId', {subcategoryId});
        }

        return query.getMany();
    }
}