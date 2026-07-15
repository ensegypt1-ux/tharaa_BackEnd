import { ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignPlacement } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

function toStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export class ListPublicCampaignsDto {
  @ApiPropertyOptional({
    enum: CampaignPlacement,
    description: 'When set, only campaigns assigned to this placement are returned',
  })
  @IsOptional()
  @IsEnum(CampaignPlacement)
  placement?: CampaignPlacement;

  @ApiPropertyOptional({
    description: 'Client auth context. Prefer this over relying on JWT for public routes.',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  authenticated?: boolean;

  @ApiPropertyOptional({ description: 'City name for targeting (e.g. Al Khafji)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Branch / store id for targeting' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  offerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  couponId?: string;

  @ApiPropertyOptional({ description: 'Current cart total for amount targeting' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cartAmount?: number;

  @ApiPropertyOptional({
    description: 'Max campaigns to return after rotation (useful for popups)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class TrackCampaignEventDto {
  @ApiPropertyOptional({ enum: ['IMPRESSION', 'CLICK'], default: 'IMPRESSION' })
  @IsOptional()
  @IsIn(['IMPRESSION', 'CLICK'])
  type?: 'IMPRESSION' | 'CLICK';

  @ApiPropertyOptional({ enum: CampaignPlacement })
  @IsOptional()
  @IsEnum(CampaignPlacement)
  placement?: CampaignPlacement;

  @ApiPropertyOptional({ description: 'Anonymous device/session id for frequency clients' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class BulkTrackCampaignEventsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toStringList(value))
  @IsUUID('4', { each: true })
  impressionIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toStringList(value))
  @IsUUID('4', { each: true })
  clickIds?: string[];

  @ApiPropertyOptional({ enum: CampaignPlacement })
  @IsOptional()
  @IsEnum(CampaignPlacement)
  placement?: CampaignPlacement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;
}
