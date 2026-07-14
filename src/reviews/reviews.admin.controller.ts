import {
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
import { AdminListReviewsDto } from './dto/review.dto';
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
    const updated = await this.reviewsService.approve(id);
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
    const updated = await this.reviewsService.reject(id);
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
}
