import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import {
  AdminSearchAnalyticsQueryDto,
  AdminWishlistAnalyticsQueryDto,
} from './dto/search-wishlist-analytics.dto';

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard summary analytics' })
  @ApiResponse({
    status: 200,
    description: 'Overview analytics',
    type: ApiSuccessDto,
  })
  overview(@Query() dto: AnalyticsQueryDto) {
    return this.analyticsService.overview(dto);
  }

  @Get('charts')
  @ApiOperation({ summary: 'Dashboard chart analytics' })
  @ApiResponse({
    status: 200,
    description: 'Chart analytics',
    type: ApiSuccessDto,
  })
  charts(@Query() dto: AnalyticsQueryDto) {
    return this.analyticsService.charts(dto);
  }

  @Get('search')
  @ApiOperation({
    summary:
      'Search analytics (totals, recent terms, paginated popular terms; no user identities)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search analytics',
    type: ApiSuccessDto,
  })
  search(@Query() dto: AdminSearchAnalyticsQueryDto) {
    return this.analyticsService.searchAnalytics(dto);
  }

  @Get('wishlist')
  @ApiOperation({
    summary: 'Wishlist analytics (totals and top wishlisted products)',
  })
  @ApiResponse({
    status: 200,
    description: 'Wishlist analytics',
    type: ApiSuccessDto,
  })
  wishlist(@Query() dto: AdminWishlistAnalyticsQueryDto) {
    return this.analyticsService.wishlistAnalytics(dto);
  }
}
