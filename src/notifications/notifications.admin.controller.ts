import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Request } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { BroadcastNotificationDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';
import { ApiPropertyOptional } from '@nestjs/swagger';

class AdminNotificationHistoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

@ApiTags('admin-notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notification history (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Notifications listed',
    type: ApiSuccessDto,
  })
  history(@Query() query: AdminNotificationHistoryDto) {
    return this.notificationsService.adminHistory(query);
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast a notification to users' })
  @ApiResponse({
    status: 201,
    description: 'Notification broadcast',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async broadcast(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: BroadcastNotificationDto,
  ) {
    const result = await this.notificationsService.broadcast(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'NOTIFICATION_BROADCAST',
      entityType: 'Notification',
      newValues: {
        titleEn: dto.titleEn,
        sent: result.sent,
        userIds: dto.userIds?.length ?? 'ALL_CUSTOMERS',
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
