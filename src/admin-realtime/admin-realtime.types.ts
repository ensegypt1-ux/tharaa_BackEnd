import {
  FulfilmentType,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';

/** Emitted on namespace `/admin` as `admin:order_created`. */
export type AdminOrderCreatedEvent = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfilmentType: FulfilmentType;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string | null;
  total: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  createdAt: string;
};

/** Admin orders list row (same shape as GET /admin/orders items). */
export type AdminOrderListRow = {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  fulfilmentType: FulfilmentType;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  couponSnapshot: unknown;
  addressSnapshot: unknown;
  storeSnapshot: unknown;
  customerNote: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  estimatedReadyAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: unknown[];
  user: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  } | null;
};

/** Emitted on namespace `/admin` as `admin:order_updated`. */
export type AdminOrderUpdatedEvent = AdminOrderListRow;

export const ADMIN_ORDERS_ROOM = 'admin:orders';
export const ADMIN_ROLE_ROOM_PREFIX = 'role:';

export const ADMIN_SOCKET_EVENTS = {
  ORDER_CREATED: 'admin:order_created',
  ORDER_UPDATED: 'admin:order_updated',
} as const;
