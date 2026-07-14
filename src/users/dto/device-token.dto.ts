import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Locale } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class DeviceTokenDto {
  @ApiProperty({ description: 'FCM / push device token' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ enum: Locale })
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}

export class RemoveDeviceTokenDto {
  @ApiProperty()
  @IsString()
  token: string;
}
