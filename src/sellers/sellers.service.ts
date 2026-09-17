import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Seller } from './entities/seller.entity';
import { CreateSellerDto } from './dto/create-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';

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

    async create(createSellerDto: CreateSellerDto): Promise<Seller> {
        const seller = this.sellersRepository.create(createSellerDto);
        return this.sellersRepository.save(seller);
    }

    async findAll(): Promise<Seller[]> {
        return this.sellersRepository.find();
    }

    async findOne(id: string): Promise<Seller> {
        const seller = await this.sellersRepository.findOneBy({ id });
        if (!seller) {
            throw new NotFoundException('Seller not found');
        }
        
        return seller;
    }

    async update(id: string, updateSellerDto: UpdateSellerDto): Promise<Seller> {
        await this.sellersRepository.update(id, updateSellerDto);
        return this.findOne(id);
    }

    async remove(id: string): Promise<void> {
        await this.sellersRepository.delete(id);
    }
}