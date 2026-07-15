import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
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
import {
  AdminListReportsDto,
  AdminListReviewsDto,
  ResolveReviewReportDto,
  ReviewReplyDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('admin-reviews')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Admin review moderation statistics' })
  @ApiResponse({
    status: 200,
    description: 'Stats retrieved',
    type: ApiSuccessDto,
  })
  stats() {
    return this.reviewsService.adminStats();
  }

  @Get('reports')
  @ApiOperation({ summary: 'List review reports' })
  @ApiResponse({
    status: 200,
    description: 'Reports listed',
    type: ApiSuccessDto,
  })
  listReports(@Query() query: AdminListReportsDto) {
    return this.reviewsService.listReports(query);
  }

  @Patch('reports/:reportId/resolve')
  @ApiOperation({ summary: 'Resolve or dismiss a review report' })
  @ApiResponse({
    status: 200,
    description: 'Report resolved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async resolveReport(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ResolveReviewReportDto,
  ) {
    const updated = await this.reviewsService.resolveReport(
      reportId,
      user.id,
      dto,
    );
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_REPORT_RESOLVE',
      entityType: 'ReviewReport',
      entityId: reportId,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Get()
  @ApiOperation({ summary: 'List product reviews (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Reviews listed',
    type: ApiSuccessDto,
  })
  list(@Query() query: AdminListReviewsDto) {
    return this.reviewsService.adminList(query);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a review and recompute product rating' })
  @ApiResponse({
    status: 200,
    description: 'Review approved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async approve(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.approve(id, user.id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_APPROVE',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a review' })
  @ApiResponse({
    status: 200,
    description: 'Review rejected',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async reject(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.reject(id, user.id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_REJECT',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Patch(':id/hide')
  @ApiOperation({ summary: 'Hide an approved review' })
  @ApiResponse({
    status: 200,
    description: 'Review hidden',
    type: ApiSuccessDto,
  })
  async hide(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.hide(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_HIDE',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Patch(':id/show')
  @ApiOperation({ summary: 'Show an approved review' })
  @ApiResponse({
    status: 200,
    description: 'Review shown',
    type: ApiSuccessDto,
  })
  async show(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.show(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_SHOW',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted review as PENDING' })
  @ApiResponse({
    status: 200,
    description: 'Review restored',
    type: ApiSuccessDto,
  })
  async restore(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.restore(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_RESTORE',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Put(':id/reply')
  @ApiOperation({ summary: 'Add or update store reply on a review' })
  @ApiResponse({
    status: 200,
    description: 'Reply saved',
    type: ApiSuccessDto,
  })
  async setReply(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReplyDto,
  ) {
    const updated = await this.reviewsService.setReply(id, user.id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_REPLY_UPSERT',
      entityType: 'ProductReview',
      entityId: id,
      newValues: { replyText: dto.text },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id/reply')
  @ApiOperation({ summary: 'Remove store reply from a review' })
  @ApiResponse({
    status: 200,
    description: 'Reply removed',
    type: ApiSuccessDto,
  })
  async removeReply(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.reviewsService.removeReply(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'REVIEW_REPLY_REMOVE',
      entityType: 'ProductReview',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
