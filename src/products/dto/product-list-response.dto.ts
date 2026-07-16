import { ApiProperty } from '@nestjs/swagger';

export class ProductListMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class ProductListResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  data: Record<string, unknown>[];

  @ApiProperty({ type: ProductListMetaDto })
  meta: ProductListMetaDto;
}
