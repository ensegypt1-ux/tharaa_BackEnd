import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfilmentType, OrderStatus, PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PlaceOrderDto {
  @ApiProperty({ enum: FulfilmentType })
  @IsEnum(FulfilmentType)
  fulfilmentType: FulfilmentType;

  @ApiPropertyOptional({
    description: 'Required when fulfilmentType is DELIVERY',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH_ON_DELIVERY,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description: 'Required when cancelling a non-pending order',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancellationReason?: string;
}

export class ListOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: FulfilmentType })
  @IsOptional()
  @IsEnum(FulfilmentType)
  fulfilmentType?: FulfilmentType;

  @ApiPropertyOptional({ description: 'Search by order number' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;
}

export class AdminListOrdersDto extends ListOrdersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'ISO date from' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date to' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'] })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';
}
