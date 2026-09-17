import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSavedProductDto {
    @IsString()
    @IsNotEmpty()
    userId!: string;

    @IsString()
    @IsNotEmpty()
    productId!: string;
}