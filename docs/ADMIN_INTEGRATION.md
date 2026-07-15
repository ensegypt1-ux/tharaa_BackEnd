# Tharaa Market Admin Dashboard — Backend Integration

Base URL: `http://192.168.10.37:3000/api/v1`  
OpenAPI: `GET /api/docs` · artifact `docs/openapi-v1.json`  
Auth: `Authorization: Bearer <accessToken>`  
Staff roles: `ADMIN` | `MANAGER` | `EMPLOYEE`

## Response envelope

Success:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "errorCode": "optional",
  "details": "optional",
  "timestamp": "...",
  "path": "..."
}
```

Common status codes: `400` validation, `401` unauthorized, `403` forbidden, `404` not found, `409` conflict, `422`/`400` business rules. Internal/Prisma errors are not exposed.

### List shapes (dashboard-compatible)

| Pattern | Endpoints | Shape |
|---|---|---|
| A | orders, coupons, reviews | `data: { items, meta }` |
| B | products, inventory, customers, notifications, audit-logs, missing images | `data: T[]` + top-level `meta` |
| C | categories, offers | `data: T[]` (no pagination; dashboard contract) |

## Authentication (shared with Flutter)

| Method | Endpoint | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | Returns profile + role; dashboard accepts only ADMIN/MANAGER/EMPLOYEE |
| POST | `/auth/refresh` | Public | Refresh-token rotation |
| POST | `/auth/logout` | Authenticated | Revokes refresh token |
| GET | `/users/me` | Authenticated | Session restoration / profile |

Account status validated on login, refresh, and JWT validate.

## Analytics

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/analytics/overview` | ADMIN, MANAGER, EMPLOYEE |
| GET | `/admin/analytics/charts` | ADMIN, MANAGER, EMPLOYEE |

Query: `range=today|last7|last7Days|last30|last30Days|thisMonth|custom`  
Custom: `from`/`to` or `dateFrom`/`dateTo`  
Revenue uses **COMPLETED** orders only.

## Orders

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/orders` | ADMIN, MANAGER, EMPLOYEE |
| GET | `/admin/orders/:id` | ADMIN, MANAGER, EMPLOYEE |
| GET | `/admin/orders/:id/print` | ADMIN, MANAGER, EMPLOYEE |
| PATCH | `/admin/orders/:id/status` | ADMIN, MANAGER, EMPLOYEE |

Query: `page`, `limit`, `q` (order number), `status`, `fulfilmentType`, `paymentMethod`, `userId`, `from`, `to`, `sort=newest|oldest`  
Detail includes customer, address/store/coupon/item snapshots, statusHistory, notifications, `allowedTransitions`, `printable`.  
Cancel requires `cancellationReason` (ADMIN/MANAGER only).

## Categories

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/categories` | ADMIN, MANAGER |
| GET | `/admin/categories/:id` | ADMIN, MANAGER |
| POST | `/admin/categories` | ADMIN, MANAGER |
| PATCH | `/admin/categories/:id` | ADMIN, MANAGER |
| DELETE | `/admin/categories/:id` | ADMIN, MANAGER |
| POST | `/admin/categories/:id/image` | ADMIN, MANAGER |
| DELETE | `/admin/categories/:id/image` | ADMIN, MANAGER |

Response includes `productCount`. Public Redis cache `categories:public` invalidated on category/product mutations.

## Products

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/products` | ADMIN, MANAGER |
| GET | `/admin/products/:id` | ADMIN, MANAGER |
| POST | `/admin/products` | ADMIN, MANAGER |
| PATCH | `/admin/products/:id` | ADMIN, MANAGER |
| DELETE | `/admin/products/:id` | ADMIN, MANAGER |
| POST | `/admin/products/:id/variants` | ADMIN, MANAGER |
| PATCH | `/admin/products/:id/variants/:variantId` | ADMIN, MANAGER |
| DELETE | `/admin/products/:id/variants/:variantId` | ADMIN, MANAGER |
| POST | `/admin/products/:id/images` | ADMIN, MANAGER |
| PATCH | `/admin/products/:id/images/:imageId/primary` | ADMIN, MANAGER |
| DELETE | `/admin/products/:id/images/:imageId` | ADMIN, MANAGER |

Query filters: `q`, `categoryId`, `isActive`, `isFeatured`, `isBestSeller`, `inStock`, `missingImages`, `lowStock`, `sortBy`, `sortDir`, `page`, `limit`.  
List fields include category, imageCount, inventory quantities, flags.

## Inventory

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/inventory` | ADMIN, MANAGER |
| GET | `/admin/inventory/movements` | ADMIN, MANAGER |
| PATCH | `/admin/inventory/adjust` | ADMIN, MANAGER |
| POST | `/admin/inventory/set-quantity` | ADMIN, MANAGER |

Adjustments create `InventoryMovement` records; reserved quantity cannot go invalid.

## Product images (Pexels + local)

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/product-images/search` | ADMIN, MANAGER |
| POST | `/admin/product-images/search` | ADMIN, MANAGER |
| POST | `/admin/product-images/select` | ADMIN, MANAGER |
| GET | `/admin/product-images/missing` | ADMIN, MANAGER |
| PATCH | `/admin/product-images/:productId/reviewed` | ADMIN, MANAGER |

`PEXELS_API_KEY` is backend-only. Select downloads, validates MIME/size, stores via StorageService, creates `ProductImage`.

## Offers & coupons

| Method | Endpoint | Roles |
|---|---|---|
| GET/POST | `/admin/offers` | ADMIN, MANAGER |
| GET/PATCH/DELETE | `/admin/offers/:id` | ADMIN, MANAGER |
| POST | `/admin/offers/:id/image` | ADMIN, MANAGER |
| DELETE | `/admin/offers/:id/image` | ADMIN, MANAGER |
| GET/POST | `/admin/coupons` | ADMIN, MANAGER |
| GET/PATCH/DELETE | `/admin/coupons/:id` | ADMIN, MANAGER |

Pricing remains centralized in `PricingService`.

## Customers

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/customers` | ADMIN, MANAGER |
| GET | `/admin/customers/:id` | ADMIN, MANAGER |
| PATCH | `/admin/customers/:id/status` | ADMIN, MANAGER |

Secrets (password hashes, refresh/reset tokens) are never returned.

## Reviews

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/reviews` | ADMIN, MANAGER |
| GET | `/admin/reviews/stats` | ADMIN, MANAGER |
| GET | `/admin/reviews/reports` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/reports/:reportId/resolve` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/:id/approve` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/:id/reject` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/:id/hide` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/:id/show` | ADMIN, MANAGER |
| PATCH | `/admin/reviews/:id/restore` | ADMIN, MANAGER |
| PUT | `/admin/reviews/:id/reply` | ADMIN, MANAGER |
| DELETE | `/admin/reviews/:id/reply` | ADMIN, MANAGER |

Admin list query: `page`, `limit`, `status`, `isVisible`, `rating`, `productId`, `userId`, `reported`, `includeDeleted`, `from`, `to`, `sort=newest\|oldest\|highest\|lowest`.

Admin stats: pending / approved / rejected / hidden / reported + average moderation time (minutes).

Store reply fields on the review (`replyText`, `repliedAt`, `replyByUserId`) are returned on admin payloads and as `storeReply: { text, repliedAt }` on public reviews (no admin identity).

Customer (authenticated) review APIs:

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/products/:id/reviews/eligibility` | Completed-order eligibility |
| GET | `/reviews/me` | Own reviews |
| PATCH | `/reviews/:id` | Update own (approved → PENDING) |
| DELETE | `/reviews/:id` | Soft-delete own |
| POST | `/reviews/:id/report` | Report public review |

Public:

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/products/:id/reviews` | `sort=newest\|oldest\|highest\|lowest` |
| GET | `/products/:id/reviews/stats` | Average, count, histogram, verified count |
| POST | `/products/:productId/reviews` | Purchase-gated create (unchanged) |

## Notifications

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/notifications` | ADMIN, MANAGER |
| POST | `/admin/notifications/broadcast` | ADMIN, MANAGER |

Broadcast supports one/selected/all customers with Ar/En content. FCM failure does not fail persistence.

## Delivery / pickup / AppSettings

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/settings/public` | Public |
| PATCH | `/admin/delivery-settings` | ADMIN, MANAGER |
| PATCH | `/admin/pickup-settings` | ADMIN, MANAGER |
| GET | `/admin/settings` | ADMIN |
| GET | `/admin/settings/:key` | ADMIN |
| PUT | `/admin/settings/:key` | ADMIN |
| PATCH | `/admin/settings/bootstrap` | ADMIN |

Bootstrap group fields: `store`, `application`, `localization`, `notifications`, `featureFlags`, `authentication`, `payment`, `fulfilment`.  
Changes invalidate `bootstrap:v1` Redis cache and are reflected in `GET /bootstrap`.

## Activity log

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/admin/audit-logs` | ADMIN, MANAGER |

Fields: user, role, action, entityType, entityId, previousValues, newValues, IP, timestamp.

## Environment

```
ADMIN_DASHBOARD_ORIGINS=http://localhost:3001,http://192.168.10.37:3001
CORS_ORIGINS=http://localhost:3000,...
PEXELS_API_KEY=
```

`ADMIN_DASHBOARD_ORIGINS` is merged with `CORS_ORIGINS` (comma-separated).

## Realtime (Socket.IO)

REST remains the source of truth. Socket events are additive notifications for the admin dashboard.

### Namespace

`/admin`

Connect to the API host (same port as HTTP), not under `/api/v1`.

Example:

```js
import { io } from "socket.io-client";

const socket = io("http://192.168.10.37:3000/admin", {
  auth: { token: accessToken },
  transports: ["websocket"],
});
```

### Authentication handshake

Allowed roles: `ADMIN` | `MANAGER` | `EMPLOYEE`

Provide the existing JWT **access** token via (first match wins):

1. `handshake.auth.token` (preferred)
2. `handshake.headers.authorization` as `Bearer <accessToken>`
3. `handshake.query.token`

Rejected sessions (missing/invalid/expired token, inactive account, non-staff role) are disconnected. JWT values are never logged.

On success the socket joins:

- room `admin:orders` (all staff receive order events)
- room `role:<ROLE>` (e.g. `role:ADMIN`)

### Events

| Event | When |
|---|---|
| `admin:order_created` | After a new order is committed successfully |
| `admin:order_updated` | After status change, cancellation, or list-affecting admin order update (post-commit) |

Failed / rolled-back transactions do not emit.

#### `admin:order_created` payload

```ts
{
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
  createdAt: string; // ISO
}
```

#### `admin:order_updated` payload

Complete latest admin order **list row** (same fields as items from `GET /admin/orders`), including `items` and `user` summary.
