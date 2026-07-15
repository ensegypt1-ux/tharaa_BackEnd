import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReviewReportStatus,
  ReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminListReportsDto,
  AdminListReviewsDto,
  AdminReviewSort,
  CreateReviewDto,
  ListProductReviewsDto,
  PublicReviewSort,
  ReportReviewDto,
  ResolveReviewReportDto,
  ReviewReplyDto,
  UpdateReviewDto,
} from './dto/review.dto';

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

    if (orderItem.review && !orderItem.review.deletedAt) {
      throw new ConflictException('This order item already has a review');
    }

    if (orderItem.review?.deletedAt) {
      // Soft-deleted review on same order item: restore as pending update path
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.productReview.update({
          where: { id: orderItem.review!.id },
          data: {
            rating: dto.rating,
            comment: dto.comment?.trim() || null,
            status: ReviewStatus.PENDING,
            isVisible: false,
            deletedAt: null,
            moderatedAt: null,
            moderatedById: null,
          },
        });
        await this.recomputeProductRating(tx, productId);
        return this.mapCustomerReview(updated);
      });
    }

    const created = await this.prisma.productReview.create({
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
    return this.mapCustomerReview(created);
  }

  async updateOwn(userId: string, reviewId: string, dto: UpdateReviewDto) {
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('No fields to update');
    }

    const review = await this.findOwnedOrThrow(userId, reviewId);
    const wasPublic =
      review.status === ReviewStatus.APPROVED &&
      review.isVisible &&
      !review.deletedAt;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id: reviewId },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.comment !== undefined
            ? { comment: dto.comment.trim() || null }
            : {}),
          // Approved reviews return to moderation after customer edits
          status: ReviewStatus.PENDING,
          isVisible: false,
          moderatedAt: null,
          moderatedById: null,
        },
      });
      if (wasPublic) {
        await this.recomputeProductRating(tx, review.productId);
      }
      return result;
    });

    return this.mapCustomerReview(updated);
  }

  async softDeleteOwn(userId: string, reviewId: string) {
    const review = await this.findOwnedOrThrow(userId, reviewId);

    await this.prisma.$transaction(async (tx) => {
      await tx.productReview.update({
        where: { id: reviewId },
        data: {
          deletedAt: new Date(),
          isVisible: false,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
    });

    return { message: 'Review deleted' };
  }

  async listMine(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.ProductReviewWhereInput = {
      userId,
      deletedAt: null,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productReview.findMany({
        where,
        include: {
          product: {
            select: { id: true, nameAr: true, nameEn: true },
          },
          orderItem: { select: { id: true, orderId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        ...this.mapCustomerReview(r),
        product: r.product,
        orderId: r.orderItem.orderId,
        orderItemId: r.orderItemId,
        storeReply: this.mapPublicReply(r),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async eligibility(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const completedItems = await this.prisma.orderItem.findMany({
      where: {
        productId,
        order: { userId, status: 'COMPLETED' },
      },
      include: {
        review: true,
        order: { select: { id: true, orderNumber: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const eligibleItems = completedItems.filter(
      (item) => !item.review || item.review.deletedAt,
    );

    const existingReviews = completedItems
      .filter((item) => item.review && !item.review.deletedAt)
      .map((item) => ({
        reviewId: item.review!.id,
        orderItemId: item.id,
        orderId: item.order.id,
        status: item.review!.status,
        isVisible: item.review!.isVisible,
        rating: item.review!.rating,
      }));

    return {
      productId,
      canReview: eligibleItems.length > 0,
      eligibleOrderItems: eligibleItems.map((item) => ({
        orderItemId: item.id,
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        completedAt: item.order.createdAt,
      })),
      existingReviews,
    };
  }

  async listPublic(productId: string, query: ListProductReviewsDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, ratingAverage: true, ratingCount: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sort = query.sort ?? PublicReviewSort.newest;

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
        orderBy: this.publicOrderBy(sort),
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        verifiedPurchase: true,
        user: r.user,
        storeReply: this.mapPublicReply(r),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async publicStats(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, ratingAverage: true, ratingCount: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const where: Prisma.ProductReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
      isVisible: true,
      deletedAt: null,
    };

    const groups = await this.prisma.productReview.groupBy({
      by: ['rating'],
      where,
      _count: { _all: true },
    });

    const countByRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of groups) {
      countByRating[g.rating] = g._count._all;
    }

    const total = product.ratingCount;
    const histogram = [5, 4, 3, 2, 1].map((rating) => {
      const count = countByRating[rating] ?? 0;
      return {
        rating,
        count,
        percentage:
          total === 0 ? 0 : Math.round((count / total) * 10000) / 100,
      };
    });

    return {
      productId,
      ratingAverage: Number(product.ratingAverage),
      ratingCount: product.ratingCount,
      verifiedPurchaseCount: product.ratingCount,
      histogram,
    };
  }

  async adminList(query: AdminListReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sort = query.sort ?? AdminReviewSort.newest;

    const where: Prisma.ProductReviewWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isVisible !== undefined ? { isVisible: query.isVisible } : {}),
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.reported
        ? { reports: { some: { status: ReviewReportStatus.OPEN } } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
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
          replyByUser: {
            select: { id: true, fullName: true, email: true },
          },
          moderatedBy: {
            select: { id: true, fullName: true, email: true },
          },
          _count: {
            select: {
              reports: { where: { status: ReviewReportStatus.OPEN } },
            },
          },
        },
        orderBy: this.adminOrderBy(sort),
        skip,
        take: limit,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        productId: r.productId,
        userId: r.userId,
        orderItemId: r.orderItemId,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVisible: r.isVisible,
        deletedAt: r.deletedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        moderatedAt: r.moderatedAt,
        repliedAt: r.repliedAt,
        replyText: r.replyText,
        openReportCount: r._count.reports,
        user: r.user,
        product: r.product,
        orderItem: r.orderItem,
        replyByUser: r.replyByUser,
        moderatedBy: r.moderatedBy,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async adminStats() {
    const [
      pending,
      approved,
      rejected,
      hidden,
      reported,
      moderationRows,
    ] = await Promise.all([
      this.prisma.productReview.count({
        where: { deletedAt: null, status: ReviewStatus.PENDING },
      }),
      this.prisma.productReview.count({
        where: { deletedAt: null, status: ReviewStatus.APPROVED },
      }),
      this.prisma.productReview.count({
        where: { deletedAt: null, status: ReviewStatus.REJECTED },
      }),
      this.prisma.productReview.count({
        where: {
          deletedAt: null,
          status: ReviewStatus.APPROVED,
          isVisible: false,
        },
      }),
      this.prisma.reviewReport.count({
        where: { status: ReviewReportStatus.OPEN },
      }),
      this.prisma.productReview.findMany({
        where: { moderatedAt: { not: null } },
        select: { createdAt: true, moderatedAt: true },
        take: 5000,
        orderBy: { moderatedAt: 'desc' },
      }),
    ]);

    let averageModerationTimeMinutes: number | null = null;
    if (moderationRows.length > 0) {
      const totalMs = moderationRows.reduce((sum, row) => {
        if (!row.moderatedAt) return sum;
        return sum + (row.moderatedAt.getTime() - row.createdAt.getTime());
      }, 0);
      averageModerationTimeMinutes =
        Math.round((totalMs / moderationRows.length / 60000) * 100) / 100;
    }

    return {
      pending,
      approved,
      rejected,
      hidden,
      reported,
      averageModerationTimeMinutes,
    };
  }

  async approve(id: string, adminUserId: string) {
    const review = await this.findOrThrow(id);
    if (review.status === ReviewStatus.APPROVED && review.isVisible) {
      return this.mapAdminReview(review);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: {
          status: ReviewStatus.APPROVED,
          isVisible: true,
          moderatedAt: new Date(),
          moderatedById: adminUserId,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });

    return this.mapAdminReview(updated);
  }

  async reject(id: string, adminUserId: string) {
    const review = await this.findOrThrow(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: {
          status: ReviewStatus.REJECTED,
          isVisible: false,
          moderatedAt: new Date(),
          moderatedById: adminUserId,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });

    return this.mapAdminReview(updated);
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
    return this.mapAdminReview(updated);
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
    return this.mapAdminReview(updated);
  }

  async restore(id: string) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (!review.deletedAt) {
      return this.mapAdminReview(review);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.productReview.update({
        where: { id },
        data: {
          deletedAt: null,
          status: ReviewStatus.PENDING,
          isVisible: false,
          moderatedAt: null,
          moderatedById: null,
        },
      });
      await this.recomputeProductRating(tx, review.productId);
      return result;
    });

    return this.mapAdminReview(updated);
  }

  async setReply(id: string, adminUserId: string, dto: ReviewReplyDto) {
    await this.findOrThrow(id);
    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        replyText: dto.text.trim(),
        replyByUserId: adminUserId,
        repliedAt: new Date(),
      },
    });
    return this.mapAdminReview(updated);
  }

  async removeReply(id: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.productReview.update({
      where: { id },
      data: {
        replyText: null,
        replyByUserId: null,
        repliedAt: null,
      },
    });
    return this.mapAdminReview(updated);
  }

  async report(userId: string, reviewId: string, dto: ReportReviewDto) {
    const review = await this.prisma.productReview.findFirst({
      where: {
        id: reviewId,
        deletedAt: null,
        status: ReviewStatus.APPROVED,
        isVisible: true,
      },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId === userId) {
      throw new BadRequestException('You cannot report your own review');
    }

    try {
      const report = await this.prisma.reviewReport.create({
        data: {
          reviewId,
          reporterId: userId,
          reason: dto.reason.trim(),
        },
      });
      return {
        id: report.id,
        reviewId: report.reviewId,
        status: report.status,
        createdAt: report.createdAt,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You already reported this review');
      }
      throw err;
    }
  }

  async listReports(query: AdminListReportsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReviewReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.reviewId ? { reviewId: query.reviewId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reviewReport.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          resolvedBy: {
            select: { id: true, fullName: true, email: true },
          },
          review: {
            select: {
              id: true,
              rating: true,
              comment: true,
              status: true,
              isVisible: true,
              productId: true,
              product: { select: { id: true, nameAr: true, nameEn: true } },
              user: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.reviewReport.count({ where }),
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

  async resolveReport(
    reportId: string,
    adminUserId: string,
    dto: ResolveReviewReportDto,
  ) {
    const report = await this.prisma.reviewReport.findUnique({
      where: { id: reportId },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const status =
      dto.status &&
      (dto.status === ReviewReportStatus.RESOLVED ||
        dto.status === ReviewReportStatus.DISMISSED)
        ? dto.status
        : ReviewReportStatus.RESOLVED;

    return this.prisma.reviewReport.update({
      where: { id: reportId },
      data: {
        status,
        resolutionNote: dto.resolutionNote?.trim() || null,
        resolvedAt: new Date(),
        resolvedById: adminUserId,
      },
      include: {
        reporter: {
          select: { id: true, fullName: true, email: true },
        },
        resolvedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  private publicOrderBy(
    sort: PublicReviewSort,
  ): Prisma.ProductReviewOrderByWithRelationInput {
    switch (sort) {
      case PublicReviewSort.oldest:
        return { createdAt: 'asc' };
      case PublicReviewSort.highest:
        return { rating: 'desc' };
      case PublicReviewSort.lowest:
        return { rating: 'asc' };
      case PublicReviewSort.newest:
      default:
        return { createdAt: 'desc' };
    }
  }

  private adminOrderBy(
    sort: AdminReviewSort,
  ): Prisma.ProductReviewOrderByWithRelationInput {
    switch (sort) {
      case AdminReviewSort.oldest:
        return { createdAt: 'asc' };
      case AdminReviewSort.highest:
        return { rating: 'desc' };
      case AdminReviewSort.lowest:
        return { rating: 'asc' };
      case AdminReviewSort.newest:
      default:
        return { createdAt: 'desc' };
    }
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

  private async findOwnedOrThrow(userId: string, reviewId: string) {
    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, deletedAt: null },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only manage your own reviews');
    }
    return review;
  }

  private mapPublicReply(review: {
    replyText: string | null;
    repliedAt: Date | null;
  }) {
    if (!review.replyText || !review.repliedAt) return null;
    return {
      text: review.replyText,
      repliedAt: review.repliedAt,
    };
  }

  private mapCustomerReview(review: {
    id: string;
    productId: string;
    userId: string;
    orderItemId: string;
    rating: number;
    comment: string | null;
    status: ReviewStatus;
    isVisible: boolean;
    createdAt: Date;
    updatedAt: Date;
    replyText?: string | null;
    repliedAt?: Date | null;
  }) {
    return {
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      orderItemId: review.orderItemId,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      isVisible: review.isVisible,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      storeReply: this.mapPublicReply({
        replyText: review.replyText ?? null,
        repliedAt: review.repliedAt ?? null,
      }),
    };
  }

  private mapAdminReview(review: {
    id: string;
    productId: string;
    userId: string;
    orderItemId: string;
    rating: number;
    comment: string | null;
    status: ReviewStatus;
    isVisible: boolean;
    replyText: string | null;
    replyByUserId: string | null;
    repliedAt: Date | null;
    moderatedAt: Date | null;
    moderatedById: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      orderItemId: review.orderItemId,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      isVisible: review.isVisible,
      replyText: review.replyText,
      replyByUserId: review.replyByUserId,
      repliedAt: review.repliedAt,
      moderatedAt: review.moderatedAt,
      moderatedById: review.moderatedById,
      deletedAt: review.deletedAt,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
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
