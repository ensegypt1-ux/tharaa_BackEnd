import {
  Controller,
  Get,
  NotFoundException,
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
import { ListNotificationsDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user notifications' })
  @ApiResponse({
    status: 200,
    description: 'Notifications listed',
    type: ApiSuccessDto,
  })
  list(@CurrentUser() user: User, @Query() query: ListNotificationsDto) {
    return this.notificationsService.listForUser(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved',
    type: ApiSuccessDto,
  })
  unreadCount(@CurrentUser() user: User) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All marked as read',
    type: ApiSuccessDto,
  })
  markAllRead(@CurrentUser() user: User) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async markRead(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.notificationsService.markRead(user.id, id);
    if (!updated) {
      throw new NotFoundException('Notification not found');
    }
    return updated;
  }
}
