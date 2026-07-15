import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @ApiProperty({ example: 'خضروات' })
  @IsString()
  @MinLength(1)
  nameAr: string;

  @ApiProperty({ example: 'Vegetables' })
  @IsString()
  @MinLength(1)
  nameEn: string;

  @ApiPropertyOptional({
    description:
      'Optional parent category id. Null/omitted = main category. Parent must itself be a main category (one nesting level).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
