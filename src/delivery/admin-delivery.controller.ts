import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
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
import { DeliveryService } from './delivery.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { UpdatePickupSettingsDto } from './dto/update-pickup-settings.dto';

@ApiTags('admin-settings')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin')
export class AdminDeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly audit: AdminAuditService,
  ) {}

  @Patch('delivery-settings')
  @ApiOperation({ summary: 'Update delivery settings' })
  @ApiResponse({
    status: 200,
    description: 'Delivery settings updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async updateDelivery(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdateDeliverySettingsDto,
  ) {
    const updated = await this.deliveryService.updateDelivery(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'DELIVERY_SETTINGS_UPDATE',
      entityType: 'DeliverySettings',
      entityId: updated.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Patch('pickup-settings')
  @ApiOperation({ summary: 'Update pickup settings' })
  @ApiResponse({
    status: 200,
    description: 'Pickup settings updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async updatePickup(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdatePickupSettingsDto,
  ) {
    const updated = await this.deliveryService.updatePickup(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PICKUP_SETTINGS_UPDATE',
      entityType: 'PickupSettings',
      entityId: updated.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
