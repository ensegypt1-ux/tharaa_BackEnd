import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
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

function QueryTriStateBoolean(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    Type(() => String)(target, propertyKey);
    Transform(({ value }) => toOptionalBoolean(value))(target, propertyKey);
    IsOptional()(target, propertyKey);
    IsBoolean()(target, propertyKey);
  };
}

export class ProductFeedQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'When true, return only products with available inventory',
  })
  @QueryTriStateBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({
    description:
      'For similar products: include direct child categories when the product category is a parent',
  })
  @QueryTriStateBoolean()
  includeChildren?: boolean;
}
