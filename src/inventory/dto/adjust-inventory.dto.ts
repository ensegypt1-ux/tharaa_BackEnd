import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustInventoryDto {
  @ApiPropertyOptional({ description: 'Product inventory (no variant)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Variant inventory' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({
    description: 'Signed quantity change (positive = in, negative = out)',
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  delta: number;

  @ApiPropertyOptional({ example: 'Stock intake from supplier' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @ValidateIf((_, v) => v !== undefined && v !== null)
  note?: string;
}
