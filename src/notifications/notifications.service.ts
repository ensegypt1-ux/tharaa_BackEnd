import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, OrderStatus, Prisma } from '@prisma/client';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  BroadcastNotificationDto,
  OrderStatusNotifyPayload,
} from './dto/notification.dto';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private messaging: Messaging | null = null;
  private fcmEnabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const projectId = this.config.get<string>('fcm.projectId') || '';
    const clientEmail = this.config.get<string>('fcm.clientEmail') || '';
    const privateKey = this.config.get<string>('fcm.privateKey') || '';

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FCM credentials incomplete — push notifications will be skipped',
      );
      return;
    }

    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }
      this.messaging = getMessaging();
      this.fcmEnabled = true;
      this.logger.log('Firebase Admin initialized for FCM');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin', err as Error);
      this.messaging = null;
      this.fcmEnabled = false;
    }
  }

  async createAndSend(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        bodyAr: input.bodyAr,
        bodyEn: input.bodyEn,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    try {
      await this.sendPushToUser(input.userId, {
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        bodyAr: input.bodyAr,
        bodyEn: input.bodyEn,
        data: {
          notificationId: notification.id,
          type: input.type,
          ...(input.data
            ? Object.fromEntries(
                Object.entries(input.data).map(([k, v]) => [k, String(v)]),
              )
            : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `FCM send failed for user ${input.userId}: ${(err as Error).message}`,
      );
    }

    return notification;
  }

  async notifyGoogleAccountCreated(userId: string): Promise<void> {
    await this.createAndSend({
      userId,
      type: NotificationType.SYSTEM,
      titleAr: 'مرحباً بك في ثراء',
      titleEn: 'Welcome to Tharaa',
      bodyAr: 'تم إنشاء حسابك باستخدام Google بنجاح',
      bodyEn: 'Your account was created with Google successfully',
      data: { event: 'google_account_created' },
    });
  }

  async notifyCustomerAccountCreated(userId: string): Promise<void> {
    await this.createAndSend({
      userId,
      type: NotificationType.SYSTEM,
      titleAr: 'مرحباً بك في ثراء',
      titleEn: 'Welcome to Tharaa',
      bodyAr: 'تم إنشاء حسابك بنجاح',
      bodyEn: 'Your customer account was created successfully',
      data: { event: 'customer_account_created' },
    });
  }

  async notifyPhoneCompletionFinished(userId: string): Promise<void> {
    await this.createAndSend({
      userId,
      type: NotificationType.SYSTEM,
      titleAr: 'اكتمل رقم الهاتف',
      titleEn: 'Phone number saved',
      bodyAr: 'تم حفظ رقم هاتفك بنجاح',
      bodyEn: 'Your phone number has been saved successfully',
      data: { event: 'phone_completion_finished' },
    });
  }

  async notifyOrderStatus(
    userId: string,
    payload: OrderStatusNotifyPayload,
  ): Promise<void> {
    const copy = this.orderStatusCopy(payload.status);
    await this.createAndSend({
      userId,
      type: NotificationType.ORDER_STATUS,
      titleAr: copy.titleAr,
      titleEn: copy.titleEn,
      bodyAr: `${copy.bodyAr} (${payload.orderNumber})`,
      bodyEn: `${copy.bodyEn} (${payload.orderNumber})`,
      data: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        status: payload.status,
      },
    });
  }

  async listForUser(userId: string, query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      deletedAt: null,
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...where, isRead: false },
      }),
    ]);

    return {
      items,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, deletedAt: null, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      return null;
    }
    if (existing.isRead) {
      return existing;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, deletedAt: null, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async broadcast(dto: BroadcastNotificationDto) {
    let userIds = dto.userIds?.length ? [...new Set(dto.userIds)] : null;

    if (!userIds) {
      const users = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    const type =
      dto.type && Object.values(NotificationType).includes(dto.type as NotificationType)
        ? (dto.type as NotificationType)
        : NotificationType.ADMIN;

    const data: Record<string, unknown> = { broadcast: true };
    if (dto.orderId) data.orderId = dto.orderId;
    if (dto.productId) data.productId = dto.productId;

    const created = [];
    for (const userId of userIds) {
      try {
        const n = await this.createAndSend({
          userId,
          type,
          titleAr: dto.titleAr,
          titleEn: dto.titleEn,
          bodyAr: dto.bodyAr,
          bodyEn: dto.bodyEn,
          data,
        });
        created.push(n.id);
      } catch (err) {
        this.logger.warn(
          `Broadcast failed for user ${userId}: ${(err as Error).message}`,
        );
      }
    }

    return { sent: created.length, notificationIds: created };
  }

  async adminHistory(query: {
    page?: number;
    limit?: number;
    userId?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput = {
      deletedAt: null,
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  private async sendPushToUser(
    userId: string,
    payload: {
      titleAr: string;
      titleEn: string;
      bodyAr: string;
      bodyEn: string;
      data: Record<string, string>;
    },
  ) {
    const projectId = this.config.get<string>('fcm.projectId') || '';
    if (!projectId || !this.fcmEnabled || !this.messaging) {
      this.logger.log(
        `FCM skip (not configured) for user ${userId}: ${payload.titleEn}`,
      );
      return;
    }

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, deletedAt: null },
    });

    if (tokens.length === 0) {
      return;
    }

    const invalidTokenIds: string[] = [];

    for (const device of tokens) {
      const locale = device.locale ?? 'ar';
      const title = locale === 'en' ? payload.titleEn : payload.titleAr;
      const body = locale === 'en' ? payload.bodyEn : payload.bodyAr;

      try {
        await this.messaging.send({
          token: device.token,
          notification: { title, body },
          data: payload.data,
        });
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: string }).code)
            : '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument')
        ) {
          invalidTokenIds.push(device.id);
        } else {
          this.logger.warn(
            `FCM error for token ${device.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    if (invalidTokenIds.length > 0) {
      await this.prisma.deviceToken.updateMany({
        where: { id: { in: invalidTokenIds } },
        data: { deletedAt: new Date() },
      });
    }
  }

  private orderStatusCopy(status: OrderStatus): {
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
  } {
    const map: Record<
      OrderStatus,
      { titleAr: string; titleEn: string; bodyAr: string; bodyEn: string }
    > = {
      PENDING: {
        titleAr: 'تم استلام طلبك',
        titleEn: 'Order received',
        bodyAr: 'طلبك قيد الانتظار',
        bodyEn: 'Your order is pending',
      },
      CONFIRMED: {
        titleAr: 'تم تأكيد طلبك',
        titleEn: 'Order confirmed',
        bodyAr: 'تم تأكيد طلبك وجاري التجهيز',
        bodyEn: 'Your order has been confirmed',
      },
      PREPARING: {
        titleAr: 'جاري التجهيز',
        titleEn: 'Preparing your order',
        bodyAr: 'نقوم بتجهيز طلبك الآن',
        bodyEn: 'We are preparing your order',
      },
      READY: {
        titleAr: 'طلبك جاهز',
        titleEn: 'Order ready',
        bodyAr: 'طلبك جاهز',
        bodyEn: 'Your order is ready',
      },
      OUT_FOR_DELIVERY: {
        titleAr: 'طلبك في الطريق',
        titleEn: 'Out for delivery',
        bodyAr: 'طلبك في الطريق إليك',
        bodyEn: 'Your order is out for delivery',
      },
      COMPLETED: {
        titleAr: 'تم اكتمال الطلب',
        titleEn: 'Order completed',
        bodyAr: 'شكراً لتسوقك معنا',
        bodyEn: 'Thank you for shopping with us',
      },
      CANCELLED: {
        titleAr: 'تم إلغاء الطلب',
        titleEn: 'Order cancelled',
        bodyAr: 'تم إلغاء طلبك',
        bodyEn: 'Your order has been cancelled',
      },
    };
    return map[status];
  }
}
