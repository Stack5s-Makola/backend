import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateSellerDto {
    @IsString()
    @IsNotEmpty()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    shopName!: string;

    @IsString()
    @IsOptional()
    description?: string;
}