import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AdminSearchAnalyticsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter popular terms by substring' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: ['count', 'lastSearchedAt'],
    default: 'count',
    description: 'Sort popular terms by usage count or latest activity',
  })
  @IsOptional()
  @IsIn(['count', 'lastSearchedAt'])
  sortBy?: 'count' | 'lastSearchedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({
    default: 10,
    maximum: 50,
    description: 'How many recently searched terms to include in the summary',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  recentLimit?: number;
}

export class AdminWishlistAnalyticsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter products by Arabic or English name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    enum: ['wishlistCount'],
    default: 'wishlistCount',
  })
  @IsOptional()
  @IsIn(['wishlistCount'])
  sortBy?: 'wishlistCount';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
