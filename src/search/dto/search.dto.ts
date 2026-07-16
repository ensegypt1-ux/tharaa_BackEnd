import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SearchSuggestionsQueryDto {
  @ApiProperty({ example: 'حليب', description: 'Search query (min 1 char)' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({ default: 8, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class PopularSearchesQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RecordSearchDto {
  @ApiProperty({ example: 'حليب كامل الدسم' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  term: string;
}

export class ListRecentSearchesDto extends PaginationDto {}
