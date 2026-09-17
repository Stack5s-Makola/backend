import { Type } from 'class-transformer';
import { IsNumber, IsNotEmpty } from 'class-validator';

export class GetNearbySellersDto {
    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    latitude!: number;

    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    longitude!: number;

    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    radius!: number;
}