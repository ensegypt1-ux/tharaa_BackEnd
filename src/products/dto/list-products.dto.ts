import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

/**
 * Keep query-string booleans as strings first so enableImplicitConversion
 * cannot turn "false" into true (Boolean("false") === true).
 */
function QueryTriStateBoolean(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    Type(() => String)(target, propertyKey);
    Transform(({ value }) => toOptionalBoolean(value))(target, propertyKey);
    IsOptional()(target, propertyKey);
    IsBoolean()(target, propertyKey);
  };
}

export class ListProductsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search nameAr / nameEn / SKU (ILIKE)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Include products from direct subcategories. ' +
      'When omitted: parent categories automatically include descendants; ' +
      'child/leaf categories stay direct-only. ' +
      'When false: always direct products only. ' +
      'When true: always include direct children.',
  })
  @QueryTriStateBoolean()
  includeChildren?: boolean;

  @ApiPropertyOptional()
  @QueryTriStateBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @QueryTriStateBoolean()
  isBestSeller?: boolean;

  @ApiPropertyOptional()
  @QueryTriStateBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: 'Admin filter: active products only' })
  @QueryTriStateBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Admin filter: products with no images' })
  @QueryTriStateBoolean()
  missingImages?: boolean;

  @ApiPropertyOptional({ description: 'Admin filter: low stock products' })
  @QueryTriStateBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({
    enum: ['newest', 'name', 'price', 'stock'],
    description: 'Admin sort',
  })
  @IsOptional()
  @IsIn(['newest', 'name', 'price', 'stock'])
  sortBy?: 'newest' | 'name' | 'price' | 'stock';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
