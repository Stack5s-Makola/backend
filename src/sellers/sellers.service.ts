import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Seller } from './entities/seller.entity';

@Injectable()
export class SellersService {
    constructor(
        @InjectRepository(Seller)
        private sellersRepository: Repository<Seller>,
    ) {}

    async createSellerProfile(createSellerDto: Partial<Seller>): Promise<Seller> {
        const newSeller = this.sellersRepository.create(createSellerDto);
        return this.sellersRepository.save(newSeller);
    }

    async getSellerById(id: string): Promise<Seller | null> {
        return this.sellersRepository.findOne({
            where: {id}
        });
    }

    async getSellerByUserId(userId: string) {
        return this.sellersRepository.findOne({
            where: {userId}
        });
    }

    async updateSellerProfile(id: string, updateSellerDto: any) {
        await this.sellersRepository.update(id, updateSellerDto);
        return this.getSellerById(id);
    }

    async getSellerProducts(id: string) {
        return this.sellersRepository.findOne({
            where: {id},
            relations: ['products'],
        });
    }

    async getNearbySellers(lat: string, lng: string) {
        return this.sellersRepository.find();
    }

    async searchSellers(query: string) {
        return this.sellersRepository.find({
            where: { 
                shopName: ILike(`%${query}%`) 
            },
        });
    }

    async updateVerificationStatus(id: string, status: string) {
        await this.sellersRepository.update(id, {
            verificationStatus: status
        });
        
        return this.getSellerById(id);
    }
}