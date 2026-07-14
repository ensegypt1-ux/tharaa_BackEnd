import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  FulfilmentType,
  OrderStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerNestedListQueryDto } from './dto/customer-list-query.dto';
import { CustomerOrdersQueryDto } from './dto/customer-orders-query.dto';
import { AdminListCustomersDto } from './dto/list-customers.dto';

const IN_PROGRESS: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCustomer(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Customer not found');
  }

  async list(dto: AdminListCustomersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: UserRole.CUSTOMER,
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
    };

    if (dto.q?.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          locale: true,
          avatarPath: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true, reviews: true } },
        },
      }),
    ]);

    const ids = users.map((u) => u.id);
    const spendRows =
      ids.length === 0
        ? []
        : await this.prisma.order.groupBy({
            by: ['userId'],
            where: {
              userId: { in: ids },
              status: { not: OrderStatus.CANCELLED },
            },
            _sum: { total: true },
            _max: { createdAt: true },
          });

    const spendMap = new Map(
      spendRows.map((r) => [
        r.userId,
        {
          totalSpend: Number(r._sum.total ?? 0),
          lastOrderAt: r._max.createdAt,
        },
      ]),
    );

    return {
      data: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        status: u.status,
        locale: u.locale,
        orderCount: u._count.orders,
        reviewCount: u._count.reviews,
        totalSpend: spendMap.get(u.id)?.totalSpend ?? 0,
        lastOrderAt: spendMap.get(u.id)?.lastOrderAt ?? null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        locale: true,
        avatarPath: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        _count: {
          select: {
            orders: true,
            reviews: true,
            notifications: true,
            couponUsages: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const [
      spend,
      lastRefresh,
      lastDevice,
      addressCount,
      deviceCount,
      recentOrders,
      recentReviews,
      recentNotifications,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { userId: id, status: { not: OrderStatus.CANCELLED } },
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      this.prisma.refreshToken.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.deviceToken.findFirst({
        where: { userId: id, deletedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        select: { lastSeenAt: true },
      }),
      this.prisma.address.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.deviceToken.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          fulfilmentType: true,
          total: true,
          createdAt: true,
        },
      }),
      this.prisma.productReview.findMany({
        where: { userId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          product: { select: { id: true, nameAr: true, nameEn: true } },
          orderItem: { select: { orderId: true } },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const lastLoginAt = lastRefresh?.createdAt ?? null;
    const lastActivityAt = this.maxDate([
      user.updatedAt,
      spend._max.createdAt,
      lastLoginAt,
      lastDevice?.lastSeenAt ?? null,
    ]);

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      locale: user.locale,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      orderCount: user._count.orders,
      reviewCount: user._count.reviews,
      notificationCount: user._count.notifications,
      addressCount,
      couponUsageCount: user._count.couponUsages,
      deviceCount,
      totalSpend: Number(spend._sum.total ?? 0),
      lastOrderAt: spend._max.createdAt,
      lastLoginAt,
      lastActivityAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      addresses: user.addresses.map((a) => this.mapAddress(a)),
      orders: recentOrders.map((o) => ({
        ...o,
        total: Number(o.total),
      })),
      reviews: recentReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVisible: r.isVisible,
        createdAt: r.createdAt,
        product: r.product,
        orderId: r.orderItem.orderId,
      })),
      notifications: recentNotifications.map((n) => this.mapNotification(n)),
    };
  }

  async getSummary(id: string) {
    await this.assertCustomer(id);

    const [
      statusGroups,
      spendAgg,
      completedAgg,
      addressCount,
      reviewCount,
      couponUsageCount,
      lastOrder,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { userId: id },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { userId: id, status: { not: OrderStatus.CANCELLED } },
        _sum: { total: true },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.order.aggregate({
        where: { userId: id, status: OrderStatus.COMPLETED },
        _sum: { total: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      this.prisma.address.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.productReview.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.couponUsage.count({ where: { userId: id } }),
      this.prisma.order.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
        },
      }),
    ]);

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Partial<Record<OrderStatus, number>>;

    const orderCount = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const completedOrders = byStatus[OrderStatus.COMPLETED] ?? 0;
    const cancelledOrders = byStatus[OrderStatus.CANCELLED] ?? 0;
    const inProgressOrders = IN_PROGRESS.reduce(
      (sum, s) => sum + (byStatus[s] ?? 0),
      0,
    );
    const totalSpend = Number(spendAgg._sum.total ?? 0);
    const spendOrderCount = spendAgg._count._all || 0;
    const averageOrderValue =
      completedOrders > 0
        ? Number(completedAgg._avg.total ?? 0)
        : spendOrderCount > 0
          ? totalSpend / spendOrderCount
          : 0;

    return {
      orderCount,
      completedOrders,
      cancelledOrders,
      inProgressOrders,
      totalSpend,
      averageOrderValue,
      lastOrderAt: spendAgg._max.createdAt,
      lastOrder: lastOrder
        ? { ...lastOrder, total: Number(lastOrder.total) }
        : null,
      addressCount,
      reviewCount,
      couponUsageCount,
      ordersByStatus: statusGroups.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
    };
  }

  async getAnalytics(id: string) {
    await this.assertCustomer(id);

    const now = new Date();
    const currentFrom = this.daysAgo(29, now);
    const previousTo = new Date(currentFrom.getTime() - 1);
    const previousFrom = this.daysAgo(29, previousTo);

    const lifetimeOrders = await this.prisma.order.findMany({
      where: { userId: id },
      select: {
        id: true,
        status: true,
        fulfilmentType: true,
        total: true,
        discountAmount: true,
        couponSnapshot: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            productNameAr: true,
            productNameEn: true,
            quantity: true,
            lineTotal: true,
            product: {
              select: {
                categoryId: true,
                category: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const spendByDay = new Map<string, number>();
    const ordersByDay = new Map<string, number>();
    const statusCounts = new Map<OrderStatus, number>();
    const fulfilmentCounts = new Map<FulfilmentType, number>();
    const productMap = new Map<
      string,
      { productId: string; nameAr: string; nameEn: string; quantity: number; revenue: number }
    >();
    const categoryMap = new Map<
      string,
      { categoryId: string; nameAr: string; nameEn: string; quantity: number; revenue: number }
    >();
    const couponMap = new Map<string, { code: string; usages: number; discount: number }>();

    let completedCount = 0;
    let cancelledCount = 0;
    let completedSpend = 0;

    for (const order of lifetimeOrders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
      fulfilmentCounts.set(
        order.fulfilmentType,
        (fulfilmentCounts.get(order.fulfilmentType) ?? 0) + 1,
      );
      ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);

      if (order.status === OrderStatus.CANCELLED) {
        cancelledCount += 1;
      } else {
        const total = Number(order.total);
        spendByDay.set(day, (spendByDay.get(day) ?? 0) + total);
      }

      if (order.status === OrderStatus.COMPLETED) {
        completedCount += 1;
        completedSpend += Number(order.total);
      }

      const coupon = order.couponSnapshot as { code?: string } | null;
      if (coupon?.code) {
        const prev = couponMap.get(coupon.code) ?? {
          code: coupon.code,
          usages: 0,
          discount: 0,
        };
        prev.usages += 1;
        prev.discount += Number(order.discountAmount);
        couponMap.set(coupon.code, prev);
      }

      if (order.status !== OrderStatus.CANCELLED) {
        for (const item of order.items) {
          const pPrev = productMap.get(item.productId) ?? {
            productId: item.productId,
            nameAr: item.productNameAr,
            nameEn: item.productNameEn,
            quantity: 0,
            revenue: 0,
          };
          pPrev.quantity += item.quantity;
          pPrev.revenue += Number(item.lineTotal);
          productMap.set(item.productId, pPrev);

          const cat = item.product?.category;
          if (cat) {
            const cPrev = categoryMap.get(cat.id) ?? {
              categoryId: cat.id,
              nameAr: cat.nameAr,
              nameEn: cat.nameEn,
              quantity: 0,
              revenue: 0,
            };
            cPrev.quantity += item.quantity;
            cPrev.revenue += Number(item.lineTotal);
            categoryMap.set(cat.id, cPrev);
          }
        }
      }
    }

    const periodStats = (from: Date, to: Date) => {
      const inRange = lifetimeOrders.filter(
        (o) => o.createdAt >= from && o.createdAt <= to,
      );
      const orders = inRange.length;
      const spend = inRange
        .filter((o) => o.status !== OrderStatus.CANCELLED)
        .reduce((sum, o) => sum + Number(o.total), 0);
      const completed = inRange.filter((o) => o.status === OrderStatus.COMPLETED);
      const aov =
        completed.length > 0
          ? completed.reduce((sum, o) => sum + Number(o.total), 0) / completed.length
          : 0;
      return { orders, spend, averageOrderValue: aov };
    };

    const currentPeriod = periodStats(currentFrom, this.endOfDay(now));
    const previousPeriod = periodStats(previousFrom, previousTo);

    const totalOrders = lifetimeOrders.length;
    const cancellationRate =
      totalOrders > 0 ? cancelledCount / totalOrders : 0;
    const averageOrderValue =
      completedCount > 0 ? completedSpend / completedCount : 0;

    return {
      spendOverTime: [...spendByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, spend]) => ({ date, spend })),
      ordersOverTime: [...ordersByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      ordersByStatus: [...statusCounts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
      deliveryVersusPickup: [...fulfilmentCounts.entries()].map(
        ([fulfilmentType, count]) => ({ fulfilmentType, count }),
      ),
      averageOrderValue,
      cancellationRate,
      topProducts: [...productMap.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
      topCategories: [...categoryMap.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
      topCoupons: [...couponMap.values()]
        .sort((a, b) => b.usages - a.usages)
        .slice(0, 10),
      last30Days: currentPeriod,
      previous30Days: previousPeriod,
    };
  }

  async listOrders(id: string, dto: CustomerOrdersQueryDto) {
    await this.assertCustomer(id);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      userId: id,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.fulfilmentType ? { fulfilmentType: dto.fulfilmentType } : {}),
    };

    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) where.createdAt.gte = new Date(dto.from);
      if (dto.to) where.createdAt.lte = this.endOfDay(new Date(dto.to));
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: dto.sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          fulfilmentType: true,
          paymentMethod: true,
          subtotal: true,
          discountAmount: true,
          deliveryFee: true,
          total: true,
          couponSnapshot: true,
          cancellationReason: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        fulfilmentType: o.fulfilmentType,
        paymentMethod: o.paymentMethod,
        itemCount: o._count.items,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount),
        deliveryFee: Number(o.deliveryFee),
        total: Number(o.total),
        couponCode:
          o.couponSnapshot &&
          typeof o.couponSnapshot === 'object' &&
          'code' in o.couponSnapshot
            ? String((o.couponSnapshot as { code?: string }).code ?? '')
            : null,
        cancellationReason: o.cancellationReason,
        createdAt: o.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async listAddresses(id: string) {
    await this.assertCustomer(id);
    const addresses = await this.prisma.address.findMany({
      where: { userId: id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map((a) => this.mapAddress(a));
  }

  async listReviews(id: string, dto: CustomerNestedListQueryDto) {
    await this.assertCustomer(id);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { userId: id, deletedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          product: { select: { id: true, nameAr: true, nameEn: true } },
          orderItem: { select: { orderId: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVisible: r.isVisible,
        createdAt: r.createdAt,
        product: r.product,
        orderId: r.orderItem.orderId,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async listNotifications(id: string, dto: CustomerNestedListQueryDto) {
    await this.assertCustomer(id);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { userId: id, deletedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((n) => this.mapNotification(n)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async updateStatus(id: string, status: AccountStatus) {
    if (status !== AccountStatus.ACTIVE && status !== AccountStatus.SUSPENDED) {
      throw new BadRequestException('Only ACTIVE or SUSPENDED is allowed');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        locale: true,
        updatedAt: true,
      },
    });
  }

  private mapAddress(a: {
    id: string;
    label: string;
    recipientName: string;
    phone: string;
    city: string;
    district: string;
    street: string;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    directions: string | null;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    isDefault: boolean;
  }) {
    return {
      id: a.id,
      label: a.label,
      recipientName: a.recipientName,
      phone: a.phone,
      city: a.city,
      district: a.district,
      street: a.street,
      building: a.building,
      floor: a.floor,
      apartment: a.apartment,
      directions: a.directions,
      latitude: a.latitude != null ? Number(a.latitude) : null,
      longitude: a.longitude != null ? Number(a.longitude) : null,
      isDefault: a.isDefault,
    };
  }

  private mapNotification(n: {
    id: string;
    type: string;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
    data: Prisma.JsonValue | null;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
  }) {
    const data =
      n.data && typeof n.data === 'object' && !Array.isArray(n.data)
        ? (n.data as Record<string, unknown>)
        : null;
    return {
      id: n.id,
      type: n.type,
      titleAr: n.titleAr,
      titleEn: n.titleEn,
      bodyAr: n.bodyAr,
      bodyEn: n.bodyEn,
      isRead: n.isRead,
      readAt: n.readAt,
      createdAt: n.createdAt,
      orderId: typeof data?.orderId === 'string' ? data.orderId : null,
      productId: typeof data?.productId === 'string' ? data.productId : null,
      data,
    };
  }

  private maxDate(values: Array<Date | null | undefined>): Date | null {
    const times = values
      .filter((v): v is Date => v instanceof Date)
      .map((v) => v.getTime());
    if (times.length === 0) return null;
    return new Date(Math.max(...times));
  }

  private daysAgo(days: number, from = new Date()): Date {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
