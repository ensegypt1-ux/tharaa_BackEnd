import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SearchProductImagesDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Override auto-built search query' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  perPage?: number = 15;
}

export class SelectProductImageDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Direct image URL from search result' })
  @IsUrl({ require_protocol: true })
  imageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photographer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  photographerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string;

  @ApiPropertyOptional({ default: 'pexels' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceProvider?: string;
}

export class ListMissingImagesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description: 'Include products already marked reviewed/skipped',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeReviewed?: boolean;
}
