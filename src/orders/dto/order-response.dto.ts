import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfilmentType, OrderStatus, PaymentMethod } from '@prisma/client';

export class OrderMapsUrlDto {
  @ApiPropertyOptional({
    description:
      'Computed Google Maps URL when delivery addressSnapshot includes latitude and longitude',
    example: 'https://www.google.com/maps?q=28.4391,48.4913',
    nullable: true,
  })
  mapsUrl: string | null;
}

export class OrderResponseDto extends OrderMapsUrlDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  orderNumber: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ enum: FulfilmentType })
  fulfilmentType: FulfilmentType;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  addressSnapshot: Record<string, unknown> | null;
}

export class OrderListResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items: OrderResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
