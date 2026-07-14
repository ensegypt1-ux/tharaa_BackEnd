import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType, OfferScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateOfferDto {
  @ApiProperty({ example: 'عرض خاص' })
  @IsString()
  @MinLength(1)
  titleAr: string;

  @ApiProperty({ example: 'Special offer' })
  @IsString()
  @MinLength(1)
  titleEn: string;

  @ApiProperty({ enum: OfferScope })
  @IsEnum(OfferScope)
  scope: OfferScope;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({
    description: 'Required when scope is CATEGORY',
  })
  @ValidateIf((o: CreateOfferDto) => o.scope === OfferScope.CATEGORY)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when scope is PRODUCT',
  })
  @ValidateIf((o: CreateOfferDto) => o.scope === OfferScope.PRODUCT)
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
