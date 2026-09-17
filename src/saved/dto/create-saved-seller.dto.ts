import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSavedSellerDto {
    @IsString()
    @IsNotEmpty()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    sellerId!: string;
}