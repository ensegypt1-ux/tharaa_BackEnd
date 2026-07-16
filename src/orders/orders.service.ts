import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfilmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AdminRealtimeService } from '../admin-realtime/admin-realtime.service';
import {
  AdminOrderCreatedEvent,
  AdminOrderListRow,
} from '../admin-realtime/admin-realtime.types';
import { CartService } from '../cart/cart.service';
import { CouponsService } from '../coupons/coupons.service';
import { DeliveryService } from '../delivery/delivery.service';
import {
  InventoryService,
  OrderStockLine,
} from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { withOrderMapsUrl } from '../common/utils/maps-url.util';
import { RedisService } from '../redis/redis.service';
import {
  AdminListOrdersDto,
  CancelOrderDto,
  ListOrdersDto,
  PlaceOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';

const DELIVERY_FLOW: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.COMPLETED,
];

const PICKUP_FLOW: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];

const OPERATIONAL_TARGETS: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.COMPLETED,
];

const orderDetailInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      changedBy: {
        select: { id: true, fullName: true, role: true },
      },
    },
  },
  couponUsage: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cartService: CartService,
    private readonly coupons: CouponsService,
    private readonly delivery: DeliveryService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly adminRealtime: AdminRealtimeService,
  ) {}

  async placeOrder(userId: string, dto: PlaceOrderDto) {
    if (
      dto.paymentMethod != null &&
      dto.paymentMethod !== PaymentMethod.CASH_ON_DELIVERY
    ) {
      throw new BadRequestException('Only CASH_ON_DELIVERY is supported');
    }

    await this.cartService.setFulfilmentType(userId, dto.fulfilmentType);
    const cart = await this.cartService.getCart(userId);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    await this.assertFulfilmentAllowed(dto.fulfilmentType, cart.subtotal);

    let addressSnapshot: Prisma.InputJsonValue | undefined;
    let storeSnapshot: Prisma.InputJsonValue | undefined;

    if (dto.fulfilmentType === FulfilmentType.DELIVERY) {
      if (!dto.addressId) {
        throw new BadRequestException('addressId is required for delivery');
      }
      const address = await this.prisma.address.findFirst({
        where: { id: dto.addressId, userId, deletedAt: null },
      });
      if (!address) {
        throw new NotFoundException('Address not found');
      }
      if (address.city.trim().toLowerCase() !== 'al khafji') {
        throw new BadRequestException(
          'Delivery is only available in Al Khafji',
        );
      }
      addressSnapshot = {
        id: address.id,
        label: address.label,
        recipientName: address.recipientName,
        phone: address.phone,
        city: address.city,
        district: address.district,
        street: address.street,
        building: address.building,
        floor: address.floor,
        apartment: address.apartment,
        directions: address.directions,
        formattedAddress: address.formattedAddress,
        googlePlaceId: address.googlePlaceId,
        latitude: address.latitude != null ? Number(address.latitude) : null,
        longitude: address.longitude != null ? Number(address.longitude) : null,
      };
    } else {
      const pickup = await this.delivery.getPickupSettings();
      storeSnapshot = {
        storeNameAr: pickup.storeNameAr,
        storeNameEn: pickup.storeNameEn,
        addressAr: pickup.addressAr,
        addressEn: pickup.addressEn,
        latitude: Number(pickup.latitude),
        longitude: Number(pickup.longitude),
        estimatedMinutesMin: pickup.estimatedMinutesMin,
        estimatedMinutesMax: pickup.estimatedMinutesMax,
        workingHoursJson: pickup.workingHoursJson,
      };
    }

    const orderNumber = await this.nextOrderNumber();

    const cartRecord = await this.prisma.cart.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!cartRecord) {
      throw new BadRequestException('Cart not found');
    }

    const dbItems = await this.prisma.cartItem.findMany({
      where: { cartId: cartRecord.id, deletedAt: null },
      include: {
        product: {
          include: {
            images: {
              where: { deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        },
        variant: true,
      },
    });

    type LineSnap = {
      productId: string;
      variantId: string | null;
      productNameAr: string;
      productNameEn: string;
      variantNameAr: string | null;
      variantNameEn: string | null;
      unit: string;
      sku: string | null;
      imagePath: string | null;
      unitPrice: number;
      lineDiscount: number;
      lineTotal: number;
      quantity: number;
    };

    const snapshots: LineSnap[] = cart.items.map((line) => {
      const db = dbItems.find(
        (i) =>
          i.productId === line.productId &&
          (i.variantId ?? null) === (line.variantId ?? null),
      );
      if (!db) {
        throw new BadRequestException('Cart item mismatch');
      }

      return {
        productId: line.productId,
        variantId: line.variantId ?? null,
        productNameAr: db.product.nameAr,
        productNameEn: db.product.nameEn,
        variantNameAr: db.variant?.nameAr ?? null,
        variantNameEn: db.variant?.nameEn ?? null,
        unit: db.product.unit,
        sku: db.variant?.sku ?? db.product.sku ?? null,
        imagePath: db.product.images[0]?.path ?? null,
        unitPrice: line.unitPrice,
        lineDiscount: Number((line.discountAmount * line.quantity).toFixed(2)),
        lineTotal: line.lineTotal,
        quantity: line.quantity,
      };
    });

    let couponSnapshot: Prisma.InputJsonValue | undefined;
    let couponId: string | undefined;

    if (cart.coupon && cart.couponCode) {
      const validated = await this.coupons.validateCoupon(
        cart.couponCode,
        userId,
        cart.subtotal,
        dto.fulfilmentType,
      );
      couponId = validated.coupon.id;
      couponSnapshot = {
        code: validated.coupon.code,
        discountType: validated.coupon.discountType,
        discountValue: Number(validated.coupon.discountValue),
        discountAmount: validated.discountAmount,
      };
    }

    const stockLines: OrderStockLine[] = snapshots.map((s) => ({
      productId: s.productId,
      variantId: s.variantId,
      quantity: s.quantity,
    }));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: OrderStatus.PENDING,
          fulfilmentType: dto.fulfilmentType,
          paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH_ON_DELIVERY,
          subtotal: cart.subtotal,
          discountAmount: cart.discountAmount,
          deliveryFee: cart.deliveryFee,
          total: cart.total,
          couponSnapshot,
          addressSnapshot,
          storeSnapshot,
          customerNote: dto.customerNote?.trim() || null,
          items: {
            create: snapshots.map((s) => ({
              productId: s.productId,
              variantId: s.variantId,
              productNameAr: s.productNameAr,
              productNameEn: s.productNameEn,
              variantNameAr: s.variantNameAr,
              variantNameEn: s.variantNameEn,
              unit: s.unit,
              sku: s.sku,
              imagePath: s.imagePath,
              unitPrice: s.unitPrice,
              lineDiscount: s.lineDiscount,
              lineTotal: s.lineTotal,
              quantity: s.quantity,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              changedByUserId: userId,
              note: 'Order placed',
            },
          },
        },
        include: orderDetailInclude,
      });

      if (couponId && cart.discountAmount > 0) {
        await tx.couponUsage.create({
          data: {
            couponId,
            userId,
            orderId: created.id,
            discountAmount: cart.discountAmount,
          },
        });
      }

      await this.inventory.reserveForOrder(tx, stockLines);

      await tx.cartItem.updateMany({
        where: { cartId: cartRecord.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.cart.update({
        where: { id: cartRecord.id },
        data: { couponCode: null },
      });

      return created;
    });

    void this.notifications
      .notifyOrderStatus(userId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.PENDING,
      })
      .catch((err) =>
        this.logger.warn(`notifyOrderStatus failed: ${(err as Error).message}`),
      );

    void this.emitAdminOrderCreated(order.id).catch((err) =>
      this.logger.warn(
        `emitAdminOrderCreated failed: ${(err as Error).message}`,
      ),
    );

    return withOrderMapsUrl(order);
  }

  async listMine(userId: string, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.fulfilmentType ? { fulfilmentType: query.fulfilmentType } : {}),
      ...(query.q
        ? {
            orderNumber: {
              contains: query.q.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          items: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((order) => withOrderMapsUrl(order)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getMine(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: orderDetailInclude,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return withOrderMapsUrl(order);
  }

  async cancelMine(userId: string, id: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    const stockLines = this.toStockLines(order.items);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.inventory.releaseReservation(tx, stockLines);

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: dto.reason?.trim() || null,
          cancelledAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: OrderStatus.PENDING,
              toStatus: OrderStatus.CANCELLED,
              changedByUserId: userId,
              note: dto.reason?.trim() || 'Cancelled by customer',
            },
          },
        },
        include: orderDetailInclude,
      });
    });

    void this.notifications
      .notifyOrderStatus(userId, {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: OrderStatus.CANCELLED,
      })
      .catch((err) =>
        this.logger.warn(`notifyOrderStatus failed: ${(err as Error).message}`),
      );

    void this.emitAdminOrderUpdated(updated.id).catch((err) =>
      this.logger.warn(
        `emitAdminOrderUpdated failed: ${(err as Error).message}`,
      ),
    );

    return withOrderMapsUrl(updated);
  }

  async adminList(query: AdminListOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.fulfilmentType ? { fulfilmentType: query.fulfilmentType } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.q
        ? {
            orderNumber: {
              contains: query.q.trim(),
              mode: 'insensitive',
            },
          }
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
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          user: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: query.sort === 'oldest' ? 'asc' : 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((order) => withOrderMapsUrl(order)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async adminGet(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...orderDetailInclude,
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        userId: order.userId,
        deletedAt: null,
        OR: [
          {
            data: {
              path: ['orderId'],
              equals: order.id,
            },
          },
          {
            data: {
              path: ['orderNumber'],
              equals: order.orderNumber,
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const allowedTransitions = this.getAllowedTransitions(
      order.fulfilmentType,
      order.status,
    );

    return {
      ...withOrderMapsUrl(order),
      notifications,
      allowedTransitions,
      printable: this.toPrintable(order),
    };
  }

  async adminPrintable(id: string) {
    const detail = await this.adminGet(id);
    return detail.printable;
  }

  private getAllowedTransitions(
    fulfilmentType: FulfilmentType,
    status: OrderStatus,
  ): OrderStatus[] {
    if (
      status === OrderStatus.CANCELLED ||
      status === OrderStatus.COMPLETED
    ) {
      return [];
    }
    const flow =
      fulfilmentType === FulfilmentType.DELIVERY ? DELIVERY_FLOW : PICKUP_FLOW;
    const idx = flow.indexOf(status);
    const next =
      idx >= 0 && idx < flow.length - 1 ? [flow[idx + 1]] : [];
    const canCancel =
      status !== OrderStatus.PENDING;
    return canCancel ? [...next, OrderStatus.CANCELLED] : next;
  }

  private toPrintable(order: {
    orderNumber: string;
    createdAt: Date;
    status: OrderStatus;
    fulfilmentType: FulfilmentType;
    paymentMethod: PaymentMethod;
    addressSnapshot: Prisma.JsonValue | null;
    storeSnapshot: Prisma.JsonValue | null;
    couponSnapshot: Prisma.JsonValue | null;
    customerNote: string | null;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    deliveryFee: Prisma.Decimal;
    total: Prisma.Decimal;
    user: {
      fullName: string;
      phone: string | null;
      email: string | null;
    };
    items: Array<{
      productNameAr: string;
      productNameEn: string;
      variantNameAr: string | null;
      variantNameEn: string | null;
      sku: string | null;
      unit: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineDiscount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  }) {
    return {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      fulfilmentType: order.fulfilmentType,
      paymentMethod: order.paymentMethod,
      customer: {
        fullName: order.user.fullName,
        phone: order.user.phone,
        email: order.user.email,
      },
      address: order.addressSnapshot,
      store: order.storeSnapshot,
      coupon: order.couponSnapshot,
      customerNote: order.customerNote,
      items: order.items.map((item) => ({
        productNameAr: item.productNameAr,
        productNameEn: item.productNameEn,
        variantNameAr: item.variantNameAr,
        variantNameEn: item.variantNameEn,
        sku: item.sku,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineDiscount: item.lineDiscount,
        lineTotal: item.lineTotal,
      })),
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      deliveryFee: order.deliveryFee,
      total: order.total,
    };
  }

  async adminUpdateStatus(
    orderId: string,
    staff: { id: string; role: UserRole },
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const target = dto.status;

    if (target === OrderStatus.CANCELLED) {
      return this.adminCancel(order, staff, dto);
    }

    if (!OPERATIONAL_TARGETS.includes(target)) {
      throw new BadRequestException('Invalid target status');
    }

    if (
      staff.role === UserRole.EMPLOYEE &&
      !OPERATIONAL_TARGETS.includes(target)
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    this.assertForwardTransition(order.fulfilmentType, order.status, target);

    const stockLines = this.toStockLines(order.items);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        order.status === OrderStatus.PENDING &&
        target === OrderStatus.CONFIRMED
      ) {
        await this.inventory.confirmReservation(
          tx,
          order.id,
          stockLines,
          staff.id,
        );
      }

      const data: Prisma.OrderUpdateInput = {
        status: target,
        statusHistory: {
          create: {
            fromStatus: order.status,
            toStatus: target,
            changedByUserId: staff.id,
            note: dto.note?.trim() || null,
          },
        },
      };

      if (target === OrderStatus.CONFIRMED) {
        data.confirmedAt = new Date();
      }
      if (target === OrderStatus.COMPLETED) {
        data.completedAt = new Date();
      }

      return tx.order.update({
        where: { id: order.id },
        data,
        include: orderDetailInclude,
      });
    });

    void this.notifications
      .notifyOrderStatus(order.userId, {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: target,
      })
      .catch((err) =>
        this.logger.warn(`notifyOrderStatus failed: ${(err as Error).message}`),
      );

    void this.emitAdminOrderUpdated(updated.id).catch((err) =>
      this.logger.warn(
        `emitAdminOrderUpdated failed: ${(err as Error).message}`,
      ),
    );

    return withOrderMapsUrl(updated);
  }

  private async adminCancel(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
    staff: { id: string; role: UserRole },
    dto: UpdateOrderStatusDto,
  ) {
    if (staff.role !== UserRole.ADMIN && staff.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Only ADMIN or MANAGER can cancel orders');
    }

    if (order.status === OrderStatus.PENDING) {
      throw new BadRequestException(
        'Pending orders must be cancelled by the customer',
      );
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.COMPLETED
    ) {
      throw new BadRequestException('Order cannot be cancelled');
    }

    if (!dto.cancellationReason?.trim()) {
      throw new BadRequestException('cancellationReason is required');
    }

    const stockLines = this.toStockLines(order.items);
    const restorableStatuses: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.OUT_FOR_DELIVERY,
    ];

    const updated = await this.prisma.$transaction(async (tx) => {
      if (restorableStatuses.includes(order.status)) {
        await this.inventory.restoreOnCancelAfterConfirm(
          tx,
          order.id,
          stockLines,
          staff.id,
        );
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: dto.cancellationReason!.trim(),
          cancelledAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: OrderStatus.CANCELLED,
              changedByUserId: staff.id,
              note: dto.note?.trim() || dto.cancellationReason!.trim(),
            },
          },
        },
        include: orderDetailInclude,
      });
    });

    void this.notifications
      .notifyOrderStatus(order.userId, {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: OrderStatus.CANCELLED,
      })
      .catch((err) =>
        this.logger.warn(`notifyOrderStatus failed: ${(err as Error).message}`),
      );

    void this.emitAdminOrderUpdated(updated.id).catch((err) =>
      this.logger.warn(
        `emitAdminOrderUpdated failed: ${(err as Error).message}`,
      ),
    );

    return withOrderMapsUrl(updated);
  }

  private async emitAdminOrderCreated(orderId: string) {
    const row = await this.loadAdminListRow(orderId);
    if (!row) {
      return;
    }
    const payload: AdminOrderCreatedEvent = {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      fulfilmentType: row.fulfilmentType,
      paymentMethod: row.paymentMethod,
      customerName: row.user?.fullName ?? '',
      customerPhone: row.user?.phone ?? null,
      total: row.total,
      subtotal: row.subtotal,
      discountAmount: row.discountAmount,
      deliveryFee: row.deliveryFee,
      createdAt: row.createdAt,
    };
    this.adminRealtime.emitOrderCreated(payload);
  }

  private async emitAdminOrderUpdated(orderId: string) {
    const row = await this.loadAdminListRow(orderId);
    if (!row) {
      return;
    }
    this.adminRealtime.emitOrderUpdated(row);
  }

  private async loadAdminListRow(
    orderId: string,
  ): Promise<AdminOrderListRow | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
      },
    });
    if (!order) {
      return null;
    }
    return this.toAdminListRow(order);
  }

  private toAdminListRow(order: {
    id: string;
    orderNumber: string;
    userId: string;
    status: OrderStatus;
    fulfilmentType: FulfilmentType;
    paymentMethod: PaymentMethod;
    subtotal: Prisma.Decimal | number;
    discountAmount: Prisma.Decimal | number;
    deliveryFee: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    couponSnapshot: Prisma.JsonValue | null;
    addressSnapshot: Prisma.JsonValue | null;
    storeSnapshot: Prisma.JsonValue | null;
    customerNote: string | null;
    cancellationReason: string | null;
    cancelledAt: Date | null;
    confirmedAt: Date | null;
    completedAt: Date | null;
    estimatedReadyAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    items: unknown[];
    user: {
      id: string;
      fullName: string;
      phone: string | null;
      email: string | null;
    } | null;
  }): AdminOrderListRow {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      fulfilmentType: order.fulfilmentType,
      paymentMethod: order.paymentMethod,
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      couponSnapshot: order.couponSnapshot,
      addressSnapshot: order.addressSnapshot,
      storeSnapshot: order.storeSnapshot,
      customerNote: order.customerNote,
      cancellationReason: order.cancellationReason,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items,
      user: order.user,
    };
  }

  private assertForwardTransition(
    fulfilmentType: FulfilmentType,
    from: OrderStatus,
    to: OrderStatus,
  ) {
    const flow =
      fulfilmentType === FulfilmentType.DELIVERY ? DELIVERY_FLOW : PICKUP_FLOW;

    const fromIdx = flow.indexOf(from);
    const toIdx = flow.indexOf(to);

    if (fromIdx < 0 || toIdx < 0 || toIdx !== fromIdx + 1) {
      throw new BadRequestException(
        `Invalid transition from ${from} to ${to} for ${fulfilmentType}`,
      );
    }
  }

  private async assertFulfilmentAllowed(
    fulfilmentType: FulfilmentType,
    subtotal: number,
  ) {
    if (fulfilmentType === FulfilmentType.DELIVERY) {
      const settings = await this.delivery.getDeliverySettings();
      if (!settings.isEnabled) {
        throw new BadRequestException('Delivery is currently disabled');
      }
      if (subtotal < Number(settings.minOrderAmount)) {
        throw new BadRequestException(
          `Minimum order amount for delivery is ${Number(settings.minOrderAmount)}`,
        );
      }
      return;
    }

    const pickup = await this.delivery.getPickupSettings();
    if (!pickup.isEnabled) {
      throw new BadRequestException('Pickup is currently disabled');
    }
    if (subtotal < Number(pickup.minOrderAmount)) {
      throw new BadRequestException(
        `Minimum order amount for pickup is ${Number(pickup.minOrderAmount)}`,
      );
    }
  }

  private async nextOrderNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const ymd = `${y}${m}${d}`;
    const key = `order:seq:${ymd}`;
    const seq = await this.redis.incr(key);
    if (seq === 1) {
      await this.redis.expire(key, 60 * 60 * 48);
    }
    return `TH-${ymd}-${String(seq).padStart(5, '0')}`;
  }

  private toStockLines(
    items: { productId: string; variantId: string | null; quantity: number }[],
  ): OrderStockLine[] {
    return items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    }));
  }
}
