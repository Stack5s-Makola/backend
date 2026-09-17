import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedProduct } from './entities/SavedProduct.entity';
import { SavedSeller } from './entities/SavedSeller.entity';
import { CreateSavedProductDto } from './dto/create-saved-product.dto';
import { CreateSavedSellerDto } from './dto/create-saved-seller.dto';

@Injectable()
export class SavedService {
    constructor(
        @InjectRepository(SavedProduct)
        private savedProductsRepository: Repository<SavedProduct>,
        @InjectRepository(SavedSeller)
        private savedSellersRepository: Repository<SavedSeller>,
    ) {}

    async saveProduct(dto: CreateSavedProductDto): Promise<SavedProduct> {
        const savedProduct = this.savedProductsRepository.create({
            user: {id: dto.userId},
            product: {id: dto.productId},
        });
        return this.savedProductsRepository.save(savedProduct);
    }

    async removeSavedProduct(id: string): Promise<void> {
        await this.savedProductsRepository.delete(id);
    }

    async getSavedProducts(userId: string): Promise<SavedProduct[]> {
        return this.savedProductsRepository.find({
            where: {user: { id: userId}},
            relations: ['product'],
        });
    }

    async saveSeller(dto: CreateSavedSellerDto): Promise<SavedSeller> {
        const savedSeller = this.savedSellersRepository.create({
            user: {id: dto.userId},
            seller: {id: dto.sellerId},
        });
        return this.savedSellersRepository.save(savedSeller);
    }

    async removeSavedSeller(id: string): Promise<void> {
        await this.savedSellersRepository.delete(id);
    }

    async getSavedSellers(userId: string): Promise<SavedSeller[]> {
        return this.savedSellersRepository.find({
            where: {user: {id: userId}},
            relations: ['seller'],
        });
    }
}