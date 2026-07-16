import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdminListOrdersDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderListResponseDto, OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List/filter all orders (staff)' })
  @ApiResponse({
    status: 200,
    description: 'Orders listed',
    type: OrderListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  list(@Query() query: AdminListOrdersDto) {
    return this.ordersService.adminList(query);
  }

  @Get(':id/print')
  @ApiOperation({ summary: 'Get printable order snapshot (staff)' })
  @ApiResponse({
    status: 200,
    description: 'Printable order data',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  getPrintable(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.adminPrintable(id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get order detail with customer, snapshots, history, notifications, allowedTransitions',
  })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.adminGet(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (staff)' })
  @ApiResponse({
    status: 200,
    description: 'Status updated',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async updateStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const updated = await this.ordersService.adminUpdateStatus(
      id,
      { id: user.id, role: user.role },
      dto,
    );
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action:
        dto.status === 'CANCELLED'
          ? 'ORDER_CANCEL'
          : 'ORDER_STATUS_UPDATE',
      entityType: 'Order',
      entityId: id,
      newValues: {
        status: dto.status,
        note: dto.note,
        cancellationReason: dto.cancellationReason,
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
