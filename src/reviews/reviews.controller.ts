import {
  Body,
  Controller,
  Get,
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
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CreateReviewDto, ListProductReviewsDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('products')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

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
