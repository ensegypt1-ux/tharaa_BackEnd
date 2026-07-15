import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { Public } from '../common/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import {
  CreateReviewDto,
  ListProductReviewsDto,
  ReportReviewDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('products')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get(':id/reviews/stats')
  @ApiOperation({ summary: 'Public product review statistics' })
  @ApiResponse({
    status: 200,
    description: 'Review statistics',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  publicStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.publicStats(id);
  }

  @ApiBearerAuth()
  @Get(':id/reviews/eligibility')
  @ApiOperation({
    summary: 'Check whether the current user can review this product',
  })
  @ApiResponse({
    status: 200,
    description: 'Eligibility retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  eligibility(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewsService.eligibility(user.id, id);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'List approved visible product reviews' })
  @ApiResponse({
    status: 200,
    description: 'Reviews listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  listPublic(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListProductReviewsDto,
  ) {
    return this.reviewsService.listPublic(id, query);
  }

  @ApiBearerAuth()
  @Post(':productId/reviews')
  @ApiOperation({
    summary: 'Submit a product review for a completed order item',
  })
  @ApiResponse({
    status: 201,
    description: 'Review submitted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  create(
    @CurrentUser() user: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, productId, dto);
  }
}

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class CustomerReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('me')
  @ApiOperation({ summary: 'List the authenticated customer reviews' })
  @ApiResponse({
    status: 200,
    description: 'Customer reviews listed',
    type: ApiSuccessDto,
  })
  listMine(@CurrentUser() user: User, @Query() query: PaginationDto) {
    return this.reviewsService.listMine(
      user.id,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update own review (approved reviews return to PENDING moderation)',
  })
  @ApiResponse({
    status: 200,
    description: 'Review updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateOwn(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete own review' })
  @ApiResponse({
    status: 200,
    description: 'Review deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewsService.softDeleteOwn(user.id, id);
  }

  @Post(':id/report')
  @ApiOperation({ summary: 'Report a public review' })
  @ApiResponse({
    status: 201,
    description: 'Report submitted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Conflict', type: ApiErrorDto })
  report(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviewsService.report(user.id, id, dto);
  }
}
