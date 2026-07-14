import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @ApiProperty({ example: 'Ahmed Ali' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName: string;

  @ApiProperty({ example: '+966500000000' })
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional({ example: 'Al Khafji', default: 'Al Khafji' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Al Nakheel' })
  @IsString()
  @MinLength(1)
  district: string;

  @ApiProperty({ example: 'King Fahd Road' })
  @IsString()
  @MinLength(1)
  street: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  building?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  directions?: string;

  @ApiPropertyOptional({ example: 28.4391 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude?: number;

  @ApiPropertyOptional({ example: 48.4913 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Al Khafji' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  building?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apartment?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  directions?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  latitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
