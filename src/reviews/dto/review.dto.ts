import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewReportStatus, ReviewStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID()
  orderItemId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export enum PublicReviewSort {
  newest = 'newest',
  oldest = 'oldest',
  highest = 'highest',
  lowest = 'lowest',
}

export class ListProductReviewsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PublicReviewSort, default: PublicReviewSort.newest })
  @IsOptional()
  @IsEnum(PublicReviewSort)
  sort?: PublicReviewSort = PublicReviewSort.newest;
}

export enum AdminReviewSort {
  newest = 'newest',
  oldest = 'oldest',
  highest = 'highest',
  lowest = 'lowest',
}

export class AdminListReviewsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @ApiPropertyOptional({ description: 'Filter by visibility' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Customer user id' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Only reviews with open reports' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  reported?: boolean;

  @ApiPropertyOptional({ description: 'Include soft-deleted reviews' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AdminReviewSort, default: AdminReviewSort.newest })
  @IsOptional()
  @IsEnum(AdminReviewSort)
  sort?: AdminReviewSort = AdminReviewSort.newest;
}

export class ReviewReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class ReportReviewDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}

export class ResolveReviewReportDto {
  @ApiPropertyOptional({ enum: ReviewReportStatus })
  @IsOptional()
  @IsEnum(ReviewReportStatus)
  status?: ReviewReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class AdminListReportsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ReviewReportStatus })
  @IsOptional()
  @IsEnum(ReviewReportStatus)
  status?: ReviewReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reviewId?: string;
}
