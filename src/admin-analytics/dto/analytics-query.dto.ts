import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const RANGE_VALUES = [
  'today',
  'last7',
  'last7Days',
  'last30',
  'last30Days',
  'thisMonth',
  'custom',
] as const;

export type AnalyticsRangeAlias = (typeof RANGE_VALUES)[number];

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: RANGE_VALUES,
    default: 'last30',
    description:
      'Date range preset. Aliases: last7Days → last7, last30Days → last30.',
  })
  @IsOptional()
  @IsIn([...RANGE_VALUES])
  range?: AnalyticsRangeAlias = 'last30';

  @ApiPropertyOptional({ description: 'ISO date (custom range start)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date (custom range end)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Alias for `from` (custom range start)',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Alias for `to` (custom range end)',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
