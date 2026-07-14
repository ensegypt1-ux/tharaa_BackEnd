import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertAppSettingDto {
  @ApiProperty({ example: 'bootstrap.store' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  key: string;

  @ApiProperty({ description: 'JSON value for the setting key' })
  @IsObject()
  value: Record<string, unknown>;
}

export class PatchAppSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  store?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  application?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  localization?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notifications?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  featureFlags?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  authentication?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payment?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fulfilment?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  merge?: boolean = true;
}

export class UpsertSingleSettingDto {
  @ApiProperty()
  @Allow()
  value: unknown;
}
