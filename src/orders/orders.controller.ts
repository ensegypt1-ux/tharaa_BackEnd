import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CancelOrderDto, ListOrdersDto, PlaceOrderDto } from './dto/order.dto';
import { OrderListResponseDto, OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place an order from the current cart' })
  @ApiResponse({
    status: 201,
    description: 'Order placed',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  place(@CurrentUser() user: User, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List own orders' })
  @ApiResponse({
    status: 200,
    description: 'Orders listed',
    type: OrderListResponseDto,
  })
  list(@CurrentUser() user: User, @Query() query: ListOrdersDto) {
    return this.ordersService.listMine(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get own order by id' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  getOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getMine(user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending order' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelMine(user.id, id, dto);
  }
}
