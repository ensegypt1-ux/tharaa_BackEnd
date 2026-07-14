import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { PaginationDto } from '../common/dto/pagination.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@ApiTags('admin-coupons')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a coupon' })
  @ApiResponse({
    status: 201,
    description: 'Coupon created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateCouponDto,
  ) {
    const created = await this.couponsService.create(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'COUPON_CREATE',
      entityType: 'Coupon',
      entityId: created.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Get()
  @ApiOperation({ summary: 'List coupons' })
  @ApiResponse({
    status: 200,
    description: 'Coupons listed',
    type: ApiSuccessDto,
  })
  findAll(@Query() query: PaginationDto) {
    return this.couponsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by id' })
  @ApiResponse({
    status: 200,
    description: 'Coupon retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id') id: string) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    const updated = await this.couponsService.update(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'COUPON_UPDATE',
      entityType: 'Coupon',
      entityId: id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const result = await this.couponsService.remove(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'COUPON_DELETE',
      entityType: 'Coupon',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
