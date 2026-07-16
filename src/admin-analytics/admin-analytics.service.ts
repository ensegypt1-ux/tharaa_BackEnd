import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import {
  AdminSearchAnalyticsQueryDto,
  AdminWishlistAnalyticsQueryDto,
} from './dto/search-wishlist-analytics.dto';

type DateRange = { from: Date; to: Date };

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async overview(dto: AnalyticsQueryDto) {
    const range = this.resolveRange(dto);
    const [
      statusGroups,
      salesAgg,
      salesToday,
      salesWeek,
      salesMonth,
      totalCustomers,
      newCustomers,
      activeProducts,
      inactiveProducts,
      outOfStock,
      lowStock,
      activeOffers,
      activeCoupons,
      pendingReviews,
      ordersToday,
      totalOrders,
      ordersByStatusInRange,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.sumCompletedSales(range.from, range.to),
      this.sumCompletedSales(
        this.startOfDay(new Date()),
        this.endOfDay(new Date()),
      ),
      this.sumCompletedSales(this.daysAgo(6), this.endOfDay(new Date())),
      this.sumCompletedSales(
        this.startOfMonth(new Date()),
        this.endOfDay(new Date()),
      ),
      this.prisma.user.count({
        where: { role: 'CUSTOMER', deletedAt: null },
      }),
      this.prisma.user.count({
        where: {
          role: 'CUSTOMER',
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.product.count({
        where: { deletedAt: null, isActive: false },
      }),
      this.countStockFilter('out'),
      this.countStockFilter('low'),
      this.prisma.offer.count({
        where: {
          deletedAt: null,
          isActive: true,
          startsAt: { lte: new Date() },
          endsAt: { gte: new Date() },
        },
      }),
      this.prisma.coupon.count({
        where: {
          deletedAt: null,
          isActive: true,
          startsAt: { lte: new Date() },
          expiresAt: { gte: new Date() },
        },
      }),
      this.prisma.productReview.count({
        where: { deletedAt: null, status: ReviewStatus.PENDING },
      }),
      this.prisma.order.count({
        where: {
          createdAt: {
            gte: this.startOfDay(new Date()),
            lte: this.endOfDay(new Date()),
          },
        },
      }),
      this.prisma.order.count(),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Record<string, number>;

    const pick = (s: OrderStatus) => byStatus[s] ?? 0;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      summary: {
        totalOrders,
        ordersToday,
        ordersByStatus: Object.fromEntries(
          ordersByStatusInRange.map((g) => [g.status, g._count._all]),
        ),
        pendingOrders: pick(OrderStatus.PENDING),
        confirmedOrders: pick(OrderStatus.CONFIRMED),
        preparingOrders: pick(OrderStatus.PREPARING),
        readyOrders: pick(OrderStatus.READY),
        outForDeliveryOrders: pick(OrderStatus.OUT_FOR_DELIVERY),
        completedOrders: pick(OrderStatus.COMPLETED),
        cancelledOrders: pick(OrderStatus.CANCELLED),
        totalSales: salesAgg.total,
        totalRevenue: salesAgg.total,
        salesToday: salesToday.total,
        revenueToday: salesToday.total,
        salesThisWeek: salesWeek.total,
        revenueThisWeek: salesWeek.total,
        salesThisMonth: salesMonth.total,
        revenueThisMonth: salesMonth.total,
        averageOrderValue: salesAgg.average,
        ordersInRange: salesAgg.count,
        totalCustomers,
        newCustomers,
        activeProducts,
        inactiveProducts,
        outOfStockProducts: outOfStock,
        lowStockProducts: lowStock,
        activeOffers,
        activeCoupons,
        pendingReviews,
      },
    };
  }

  async charts(dto: AnalyticsQueryDto) {
    const range = this.resolveRange(dto);

    const [
      dailySales,
      ordersByStatus,
      ordersByFulfilment,
      topProducts,
      topCategories,
      couponUsage,
      newCustomers,
      cancelledInRange,
      ordersInRange,
    ] = await Promise.all([
      this.dailySeries(range),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['fulfilmentType'],
        where: {
          createdAt: { gte: range.from, lte: range.to },
          status: OrderStatus.COMPLETED,
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.topSellingProducts(range),
      this.topCategories(range),
      this.couponUsageSeries(range),
      this.newCustomersSeries(range),
      this.prisma.order.count({
        where: {
          status: OrderStatus.CANCELLED,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: range.from, lte: range.to } },
      }),
    ]);

    const weeklySales = this.bucketSeries(dailySales, 'week');
    const monthlySales = this.bucketSeries(dailySales, 'month');

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      dailySales,
      weeklySales,
      monthlySales,
      revenueByDay: dailySales,
      revenueOverTime: dailySales,
      ordersOverTime: dailySales.map((d) => ({
        date: d.date,
        orders: d.orders,
      })),
      ordersByStatus: ordersByStatus.map((r) => ({
        status: r.status,
        count: r._count._all,
      })),
      ordersByFulfilment: ordersByFulfilment.map((r) => ({
        fulfilmentType: r.fulfilmentType,
        count: r._count._all,
        revenue: Number(r._sum.total ?? 0),
      })),
      deliveryVersusPickup: ordersByFulfilment.map((r) => ({
        fulfilmentType: r.fulfilmentType,
        count: r._count._all,
      })),
      topSellingProducts: topProducts,
      topCategories,
      couponUsage,
      newCustomersOverTime: newCustomers,
      cancellationRate:
        ordersInRange === 0
          ? 0
          : Math.round((cancelledInRange / ordersInRange) * 10000) / 100,
    };
  }

  async searchAnalytics(dto: AdminSearchAnalyticsQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? 'count';
    const sortDir = dto.sortDir ?? 'desc';
    const recentLimit = dto.recentLimit ?? 10;
    const q = dto.q?.trim();

    const termFilter: Prisma.PopularSearchWhereInput = q
      ? {
          OR: [
            { term: { contains: q, mode: 'insensitive' } },
            {
              termKey: {
                contains: q.toLocaleLowerCase('ar'),
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};

    const [sumAgg, uniqueTerms, popularTotal, popularItems, recentItems] =
      await Promise.all([
        this.prisma.popularSearch.aggregate({
          _sum: { count: true },
        }),
        this.prisma.popularSearch.count(),
        this.prisma.popularSearch.count({ where: termFilter }),
        this.prisma.popularSearch.findMany({
          where: termFilter,
          orderBy:
            sortBy === 'lastSearchedAt'
              ? [{ lastSearchedAt: sortDir }, { count: 'desc' }]
              : [{ count: sortDir }, { lastSearchedAt: 'desc' }],
          skip,
          take: limit,
          select: {
            term: true,
            count: true,
            lastSearchedAt: true,
            createdAt: true,
          },
        }),
        this.prisma.popularSearch.findMany({
          orderBy: [{ lastSearchedAt: 'desc' }, { count: 'desc' }],
          take: recentLimit,
          select: {
            term: true,
            count: true,
            lastSearchedAt: true,
          },
        }),
      ]);

    return {
      totals: {
        totalSearches: sumAgg._sum.count ?? 0,
        uniqueTerms,
      },
      recentSearches: recentItems.map((r) => ({
        term: r.term,
        count: r.count,
        lastSearchedAt: r.lastSearchedAt,
      })),
      popularSearches: {
        data: popularItems.map((r) => ({
          term: r.term,
          count: r.count,
          lastSearchedAt: r.lastSearchedAt,
          createdAt: r.createdAt,
        })),
        meta: {
          page,
          limit,
          total: popularTotal,
          totalPages: Math.ceil(popularTotal / limit) || 0,
        },
      },
    };
  }

  async wishlistAnalytics(dto: AdminWishlistAnalyticsQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortDir = dto.sortDir ?? 'desc';
    const q = dto.q?.trim();

    const [totalWishlistItems, usersWithWishlistGroups, grouped] =
      await Promise.all([
        this.prisma.wishlistItem.count(),
        this.prisma.wishlistItem.groupBy({
          by: ['userId'],
          _count: { _all: true },
        }),
        this.prisma.wishlistItem.groupBy({
          by: ['productId'],
          _count: { _all: true },
          orderBy: {
            _count: { productId: sortDir },
          },
        }),
      ]);

    const productIds = grouped.map((g) => g.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            ...(q
              ? {
                  OR: [
                    { nameAr: { contains: q, mode: 'insensitive' } },
                    { nameEn: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            isActive: true,
            deletedAt: true,
            images: {
              where: { deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
              select: { path: true },
            },
          },
        })
      : [];

    const productById = new Map(products.map((p) => [p.id, p]));
    const countByProduct = new Map(
      grouped.map((g) => [g.productId, g._count._all]),
    );

    let rows = productIds
      .map((productId) => {
        const product = productById.get(productId);
        if (!product) {
          return null;
        }
        return {
          productId: product.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          isActive: product.isActive && product.deletedAt == null,
          imageUrl: product.images[0]
            ? this.storage.getPublicUrl(product.images[0].path)
            : null,
          wishlistCount: countByProduct.get(productId) ?? 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    rows = rows.sort((a, b) =>
      sortDir === 'asc'
        ? a.wishlistCount - b.wishlistCount
        : b.wishlistCount - a.wishlistCount,
    );

    const total = rows.length;
    const data = rows.slice(skip, skip + limit);

    return {
      totals: {
        totalWishlistItems,
        usersWithWishlist: usersWithWishlistGroups.length,
      },
      topWishlistedProducts: {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      },
    };
  }

  /** Revenue aggregates use COMPLETED orders only. */
  private async sumCompletedSales(from: Date, to: Date) {
    const agg = await this.prisma.order.aggregate({
      where: {
        status: OrderStatus.COMPLETED,
        createdAt: { gte: from, lte: to },
      },
      _sum: { total: true },
      _avg: { total: true },
      _count: { _all: true },
    });
    return {
      total: Number(agg._sum.total ?? 0),
      average: Number(agg._avg.total ?? 0),
      count: agg._count._all,
    };
  }

  private async dailySeries(range: DateRange) {
    const rows = await this.prisma.$queryRaw<
      { day: Date; orders: bigint; sales: Prisma.Decimal }[]
    >`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*)::bigint AS orders,
             COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END), 0) AS sales
      FROM "Order"
      WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      orders: Number(r.orders),
      sales: Number(r.sales),
      revenue: Number(r.sales),
    }));
  }

  private bucketSeries(
    daily: { date: string; orders: number; sales: number }[],
    mode: 'week' | 'month',
  ) {
    const map = new Map<string, { key: string; orders: number; sales: number }>();
    for (const row of daily) {
      const d = new Date(row.date + 'T00:00:00Z');
      const key =
        mode === 'month'
          ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
          : this.isoWeekKey(d);
      const cur = map.get(key) ?? { key, orders: 0, sales: 0 };
      cur.orders += row.orders;
      cur.sales += row.sales;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }

  private isoWeekKey(d: Date) {
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private async topSellingProducts(range: DateRange) {
    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        nameAr: string;
        nameEn: string;
        quantity: bigint;
        revenue: Prisma.Decimal;
      }[]
    >`
      SELECT oi."productId",
             MAX(oi."productNameAr") AS "nameAr",
             MAX(oi."productNameEn") AS "nameEn",
             SUM(oi.quantity)::bigint AS quantity,
             SUM(oi."lineTotal") AS revenue
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."createdAt" >= ${range.from}
        AND o."createdAt" <= ${range.to}
        AND o.status = 'COMPLETED'
      GROUP BY oi."productId"
      ORDER BY quantity DESC
      LIMIT 10
    `;

    return rows.map((r) => ({
      productId: r.productId,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
    }));
  }

  private async topCategories(range: DateRange) {
    const rows = await this.prisma.$queryRaw<
      {
        categoryId: string;
        nameAr: string;
        nameEn: string;
        quantity: bigint;
        revenue: Prisma.Decimal;
      }[]
    >`
      SELECT p."categoryId",
             c."nameAr",
             c."nameEn",
             SUM(oi.quantity)::bigint AS quantity,
             SUM(oi."lineTotal") AS revenue
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o.id = oi."orderId"
      INNER JOIN "Product" p ON p.id = oi."productId"
      INNER JOIN "Category" c ON c.id = p."categoryId"
      WHERE o."createdAt" >= ${range.from}
        AND o."createdAt" <= ${range.to}
        AND o.status = 'COMPLETED'
      GROUP BY p."categoryId", c."nameAr", c."nameEn"
      ORDER BY revenue DESC
      LIMIT 10
    `;

    return rows.map((r) => ({
      categoryId: r.categoryId,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
    }));
  }

  private async couponUsageSeries(range: DateRange) {
    const rows = await this.prisma.$queryRaw<
      { day: Date; usages: bigint; discount: Prisma.Decimal }[]
    >`
      SELECT date_trunc('day', cu."createdAt") AS day,
             COUNT(*)::bigint AS usages,
             COALESCE(SUM(cu."discountAmount"), 0) AS discount
      FROM "CouponUsage" cu
      WHERE cu."createdAt" >= ${range.from} AND cu."createdAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      usages: Number(r.usages),
      discount: Number(r.discount),
    }));
  }

  private async newCustomersSeries(range: DateRange) {
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*)::bigint AS count
      FROM "User"
      WHERE role = 'CUSTOMER'
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${range.from}
        AND "createdAt" <= ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      count: Number(r.count),
    }));
  }

  private async countStockFilter(mode: 'out' | 'low'): Promise<number> {
    const rows =
      mode === 'out'
        ? await this.prisma.$queryRaw<{ c: bigint }[]>`
            SELECT COUNT(*)::bigint AS c FROM "Product" p
            WHERE p."deletedAt" IS NULL AND p."isActive" = true
              AND (
                (p."hasVariants" = false AND EXISTS (
                  SELECT 1 FROM "Inventory" i
                  WHERE i."productId" = p.id
                    AND (i.quantity - i."reservedQuantity") <= 0
                ))
                OR (p."hasVariants" = true AND NOT EXISTS (
                  SELECT 1 FROM "ProductVariant" v
                  INNER JOIN "Inventory" i ON i."variantId" = v.id
                  WHERE v."productId" = p.id AND v."deletedAt" IS NULL
                    AND (i.quantity - i."reservedQuantity") > 0
                ))
              )
          `
        : await this.prisma.$queryRaw<{ c: bigint }[]>`
            SELECT COUNT(*)::bigint AS c FROM "Product" p
            WHERE p."deletedAt" IS NULL AND p."isActive" = true
              AND p."hasVariants" = false
              AND EXISTS (
                SELECT 1 FROM "Inventory" i
                WHERE i."productId" = p.id
                  AND (i.quantity - i."reservedQuantity") > 0
                  AND (i.quantity - i."reservedQuantity") <= p."lowStockThreshold"
              )
          `;
    return Number(rows[0]?.c ?? 0);
  }

  private resolveRange(dto: AnalyticsQueryDto): DateRange {
    const now = new Date();
    const to = this.endOfDay(now);
    const range = dto.range ?? 'last30';
    switch (range) {
      case 'today':
        return { from: this.startOfDay(now), to };
      case 'last7':
      case 'last7Days':
        return { from: this.daysAgo(6), to };
      case 'last30':
      case 'last30Days':
        return { from: this.daysAgo(29), to };
      case 'thisMonth':
        return { from: this.startOfMonth(now), to };
      case 'custom': {
        const fromRaw = dto.from ?? dto.dateFrom;
        const toRaw = dto.to ?? dto.dateTo;
        if (!fromRaw || !toRaw) {
          throw new BadRequestException(
            'from/to (or dateFrom/dateTo) are required for custom range',
          );
        }
        const from = new Date(fromRaw);
        const end = new Date(toRaw);
        if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime())) {
          throw new BadRequestException('Invalid from/to date');
        }
        return { from: this.startOfDay(from), to: this.endOfDay(end) };
      }
      default:
        return { from: this.daysAgo(29), to };
    }
  }

  private startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  private startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  private daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return this.startOfDay(d);
  }
}
