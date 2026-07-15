import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignDestinationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ enum: CampaignDestinationType })
  @IsEnum(CampaignDestinationType)
  destinationType: CampaignDestinationType;

  @ApiPropertyOptional({
    description:
      'Required when destinationType is OFFER, CATEGORY, PRODUCT, or COUPON',
  })
  @ValidateIf((o: CreateCampaignDto) =>
    DESTINATION_REQUIRES_ID.includes(o.destinationType),
  )
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional({ example: 'تسوق الآن' })
  @IsOptional()
  @IsString()
  buttonLabelAr?: string;

  @ApiPropertyOptional({ example: 'Shop now' })
  @IsOptional()
  @IsString()
  buttonLabelEn?: string;
}
