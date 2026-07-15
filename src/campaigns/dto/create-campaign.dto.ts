import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CampaignAudience,
  CampaignCtaStyle,
  CampaignDestinationType,
  CampaignFrequency,
  CampaignLayout,
  CampaignPlacement,
  CampaignRotationMode,
  CampaignTextAlign,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const DESTINATION_REQUIRES_ID: CampaignDestinationType[] = [
  CampaignDestinationType.OFFER,
  CampaignDestinationType.CATEGORY,
  CampaignDestinationType.PRODUCT,
  CampaignDestinationType.COUPON,
];

export class CreateCampaignDto {
  @ApiProperty({ example: 'عرض رمضان' })
  @IsString()
  @MinLength(1)
  titleAr: string;

  @ApiProperty({ example: 'Ramadan offer' })
  @IsString()
  @MinLength(1)
  titleEn: string;

  @ApiPropertyOptional({ example: 'خصومات تصل إلى 30%' })
  @IsOptional()
  @IsString()
  subtitleAr?: string;

  @ApiPropertyOptional({ example: 'Up to 30% off' })
  @IsOptional()
  @IsString()
  subtitleEn?: string;

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

  @ApiPropertyOptional({
    default: 0,
    description: 'Legacy sort key (kept for compatibility)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    default: 0,
    description: 'Higher priority wins for PRIORITY rotation',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: 1, description: 'Weight for WEIGHT rotation' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weight?: number;

  @ApiPropertyOptional({ enum: CampaignRotationMode, default: CampaignRotationMode.PRIORITY })
  @IsOptional()
  @IsEnum(CampaignRotationMode)
  rotationMode?: CampaignRotationMode;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxImpressions?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxClicks?: number | null;

  @ApiPropertyOptional({
    enum: CampaignPlacement,
    isArray: true,
    description: 'One or more placements. Defaults to HOME_SLIDER when omitted.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(CampaignPlacement, { each: true })
  placements?: CampaignPlacement[];

  @ApiPropertyOptional({ enum: CampaignLayout, default: CampaignLayout.HERO_BANNER })
  @IsOptional()
  @IsEnum(CampaignLayout)
  layout?: CampaignLayout;

  @ApiPropertyOptional({ enum: CampaignAudience, default: CampaignAudience.ALL })
  @IsOptional()
  @IsEnum(CampaignAudience)
  audience?: CampaignAudience;

  @ApiPropertyOptional({ enum: CampaignFrequency, default: CampaignFrequency.ALWAYS })
  @IsOptional()
  @IsEnum(CampaignFrequency)
  frequency?: CampaignFrequency;

  @ApiPropertyOptional({ description: 'Required when frequency is DISMISS_HOURS' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dismissHours?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetBranchIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetProductIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetOfferIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetCouponIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minCartAmount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCartAmount?: number | null;

  @ApiPropertyOptional({ example: '#1B5E20' })
  @IsOptional()
  @IsString()
  backgroundColor?: string | null;

  @ApiPropertyOptional({ example: '#1B5E20' })
  @IsOptional()
  @IsString()
  gradientFrom?: string | null;

  @ApiPropertyOptional({ example: '#66BB6A' })
  @IsOptional()
  @IsString()
  gradientTo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeTextAr?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeTextEn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discountBadgeAr?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discountBadgeEn?: string | null;

  @ApiPropertyOptional({ enum: CampaignCtaStyle, default: CampaignCtaStyle.PRIMARY })
  @IsOptional()
  @IsEnum(CampaignCtaStyle)
  ctaStyle?: CampaignCtaStyle;

  @ApiPropertyOptional({ enum: CampaignTextAlign, default: CampaignTextAlign.START })
  @IsOptional()
  @IsEnum(CampaignTextAlign)
  textAlign?: CampaignTextAlign;

  @ApiPropertyOptional({ default: 0.35 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  overlayOpacity?: number | null;

  @ApiPropertyOptional({ default: 16 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(64)
  cornerRadius?: number | null;

  @ApiProperty({ enum: CampaignDestinationType })
  @IsEnum(CampaignDestinationType)
  destinationType: CampaignDestinationType;

  @ApiPropertyOptional({
    description: 'Required when destinationType is OFFER, CATEGORY, PRODUCT, or COUPON',
  })
  @ValidateIf((o: CreateCampaignDto) =>
    DESTINATION_REQUIRES_ID.includes(o.destinationType),
  )
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({
    description: 'Required when destinationType is EXTERNAL_URL',
  })
  @ValidateIf(
    (o: CreateCampaignDto) =>
      o.destinationType === CampaignDestinationType.EXTERNAL_URL,
  )
  @IsUrl({ require_protocol: true })
  destinationUrl?: string;

  @ApiPropertyOptional({
    description: 'Required when destinationType is INTERNAL_ROUTE (e.g. /offers)',
  })
  @ValidateIf(
    (o: CreateCampaignDto) =>
      o.destinationType === CampaignDestinationType.INTERNAL_ROUTE,
  )
  @IsString()
  @MinLength(1)
  destinationRoute?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'When destination is COUPON, signal client to auto-apply code',
  })
  @IsOptional()
  @IsBoolean()
  autoApplyCoupon?: boolean;

  @ApiPropertyOptional({ example: 'تسوق الآن' })
  @IsOptional()
  @IsString()
  buttonLabelAr?: string;

  @ApiPropertyOptional({ example: 'Shop now' })
  @IsOptional()
  @IsString()
  buttonLabelEn?: string;
}
