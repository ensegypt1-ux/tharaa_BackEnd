import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, productId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: { order: true, review: true },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }

    if (orderItem.order.userId !== userId) {
      throw new BadRequestException('Order item does not belong to you');
    }

    if (orderItem.order.status !== 'COMPLETED') {
      throw new BadRequestException(
        'You can only review items from completed orders',
      );
    }

    if (orderItem.productId !== productId) {
      throw new BadRequestException('Product does not match the order item');
    }

    if (orderItem.review) {
      throw new ConflictException('This order item already has a review');
    }

    return this.prisma.productReview.create({
      data: {
        productId,
        userId,
        orderItemId: dto.orderItemId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        status: ReviewStatus.PENDING,
        isVisible: false,
      },
    });
  }

  async listPublic(productId: string, query: PaginationDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
      isVisible: true,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productReview.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarPath: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async adminList(query: PaginationDto & { status?: ReviewStatus }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductReviewWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productReview.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          product: {
            select: { id: true, nameAr: true, nameEn: true },
          },
          orderItem: {
            select: { id: true, orderId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async approve(id: string) {
    const review = await this.findOrThrow(id);
    if (review.status === ReviewStatus.APPROVED && review.isVisible) {
      return review;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: {
          status: ReviewStatus.APPROVED,
          isVisible: true,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });

    return updated;
  }

  async reject(id: string) {
    const review = await this.findOrThrow(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: {
          status: ReviewStatus.REJECTED,
          isVisible: false,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });

    return updated;
  }

  async hide(id: string) {
    const review = await this.findOrThrow(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: { isVisible: false },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });
    return updated;
  }

  async show(id: string) {
    const review = await this.findOrThrow(id);
    if (review.status !== ReviewStatus.APPROVED) {
      throw new BadRequestException('Only approved reviews can be shown');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: { isVisible: true },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });
    return updated;
  }

  private async findOrThrow(id: string) {
    const review = await this.prisma.productReview.findFirst({
      where: { id, deletedAt: null },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  private async recomputeProductRating(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const agg = await tx.productReview.aggregate({
      where: {
        productId,
        status: ReviewStatus.APPROVED,
        isVisible: true,
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        ratingAverage: Number((agg._avg.rating ?? 0).toFixed(2)),
        ratingCount: agg._count._all,
      },
    });
  }
}
