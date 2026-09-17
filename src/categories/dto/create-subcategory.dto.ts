import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSubcategoryDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsNotEmpty()
    categoryId!: string;
}