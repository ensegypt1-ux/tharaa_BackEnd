import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListNotificationsDto extends PaginationDto {}

export class BroadcastNotificationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  titleAr: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  titleEn: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  bodyAr: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  bodyEn: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'If omitted, broadcast to all active customers with tokens',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: 'Optional related order id stored in notification data',
  })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Optional related product id stored in notification data',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Notification type override',
    enum: ['ADMIN', 'OFFER', 'SYSTEM', 'ORDER_STATUS'],
  })
  @IsOptional()
  @IsString()
  type?: string;
}

export type OrderStatusNotifyPayload = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
};
