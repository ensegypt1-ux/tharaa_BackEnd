import { Module } from '@nestjs/common';
import { AdminReviewsController } from './reviews.admin.controller';
import {
  CustomerReviewsController,
  ProductReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [
    ProductReviewsController,
    CustomerReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
