import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CategoryImageFromUrlDto {
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
