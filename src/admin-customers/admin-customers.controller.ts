import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
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
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdminCustomersService } from './admin-customers.service';
import { CustomerNestedListQueryDto } from './dto/customer-list-query.dto';
import { CustomerOrdersQueryDto } from './dto/customer-orders-query.dto';
import { AdminListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@ApiTags('admin-customers')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(
    private readonly customersService: AdminCustomersService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List customers' })
  @ApiResponse({
    status: 200,
    description: 'Customers listed',
    type: ApiSuccessDto,
  })
  list(@Query() dto: AdminListCustomersDto) {
    return this.customersService.list(dto);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Customer aggregate summary cards' })
  @ApiResponse({ status: 200, description: 'Summary', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getSummary(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Customer analytics aggregates' })
  @ApiResponse({ status: 200, description: 'Analytics', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  analytics(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getAnalytics(id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Paginated customer order history' })
  @ApiResponse({ status: 200, description: 'Orders listed', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  orders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: CustomerOrdersQueryDto,
  ) {
    return this.customersService.listOrders(id, dto);
  }

  @Get(':id/addresses')
  @ApiOperation({ summary: 'Customer addresses' })
  @ApiResponse({ status: 200, description: 'Addresses', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  addresses(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.listAddresses(id);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: 'Paginated customer reviews' })
  @ApiResponse({ status: 200, description: 'Reviews', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  reviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: CustomerNestedListQueryDto,
  ) {
    return this.customersService.listReviews(id, dto);
  }

  @Get(':id/notifications')
  @ApiOperation({ summary: 'Paginated customer notifications' })
  @ApiResponse({ status: 200, description: 'Notifications', type: ApiSuccessDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  notifications(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: CustomerNestedListQueryDto,
  ) {
    return this.customersService.listNotifications(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer profile' })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.getOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Suspend or reactivate a customer' })
  @ApiResponse({
    status: 200,
    description: 'Customer status updated',
    type: ApiSuccessDto,
  })
  async updateStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerStatusDto,
  ) {
    const updated = await this.customersService.updateStatus(id, dto.status);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CUSTOMER_STATUS_UPDATE',
      entityType: 'User',
      entityId: id,
      newValues: { status: dto.status },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
