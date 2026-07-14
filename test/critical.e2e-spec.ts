import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FulfilmentType,
  OrderStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

// CommonJS-compatible import for Jest
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment for e2e tests`);
  }
  return value;
}

describe('Tharaa Market critical flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let customerToken: string;
  let customerRefresh: string;
  let adminToken: string;
  let employeeToken: string;
  let productId: string;
  let addressId: string;
  let orderId: string;
  let orderItemId: string;
  let customerPassword: string;
  let employeePassword: string;
  let seedAdminEmail: string;
  let seedAdminPassword: string;

  const unique = Date.now();

  beforeAll(async () => {
    seedAdminEmail = requireEnv('SEED_ADMIN_EMAIL');
    seedAdminPassword = requireEnv('SEED_ADMIN_PASSWORD');
    employeePassword = requireEnv('E2E_EMPLOYEE_PASSWORD');
    customerPassword = `Cust-${randomBytes(12).toString('hex')}!`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = new PrismaClient();

    const product = await prisma.product.findFirst({
      where: { sku: 'TH-TOM-001', deletedAt: null },
    });
    if (!product) {
      throw new Error('Seed product TH-TOM-001 missing — run prisma db seed');
    }
    productId = product.id;
    await prisma.inventory.updateMany({
      where: { productId },
      data: { quantity: 100, reservedQuantity: 0 },
    });

    const empHash = await bcrypt.hash(employeePassword, 10);
    await prisma.user.upsert({
      where: { email: 'employee@tharaa.market' },
      update: {
        passwordHash: empHash,
        role: UserRole.EMPLOYEE,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        email: 'employee@tharaa.market',
        fullName: 'Store Employee',
        passwordHash: empHash,
        role: UserRole.EMPLOYEE,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('registers and logs in a customer', async () => {
    const email = `customer${unique}@test.tharaa.market`;
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Test Customer',
        email,
        phone: `+9665${String(unique).slice(-8)}`,
        password: customerPassword,
      })
      .expect(201);

    expect(register.body.success).toBe(true);
    expect(register.body.data.accessToken).toBeDefined();
    customerToken = register.body.data.accessToken;
    customerRefresh = register.body.data.refreshToken;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: customerPassword })
      .expect(201);

    expect(login.body.data.accessToken).toBeDefined();
    customerToken = login.body.data.accessToken;
    customerRefresh = login.body.data.refreshToken;
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: customerRefresh })
      .expect(201);

    const oldRefresh = customerRefresh;
    customerToken = rotated.body.data.accessToken;
    customerRefresh = rotated.body.data.refreshToken;
    expect(customerRefresh).not.toBe(oldRefresh);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);
  });

  it('enforces role protection on admin endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: seedAdminEmail,
        password: seedAdminPassword,
      })
      .expect(201);
    adminToken = adminLogin.body.data.accessToken;

    const empLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: 'employee@tharaa.market',
        password: employeePassword,
      })
      .expect(201);
    employeeToken = empLogin.body.data.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('validates coupons and delivery fee calculation', async () => {
    const feeRes = await request(app.getHttpServer())
      .get('/api/v1/settings/public')
      .expect(200);

    const fee = Number(feeRes.body.data.delivery.fee);
    const threshold = Number(feeRes.body.data.delivery.freeDeliveryThreshold);
    expect(fee).toBe(15);
    expect(threshold).toBe(150);

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 10 })
      .expect(201);

    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(cart.body.data.subtotal).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ code: 'THARAA10', fulfilmentType: 'DELIVERY', subtotal: 100 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ code: 'INVALIDCODE', fulfilmentType: 'DELIVERY', subtotal: 100 })
      .expect(400);
  });

  it('creates address, places pickup order, and reserves stock', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    await request(app.getHttpServer())
      .post('/api/v1/cart/sync')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ items: [{ productId, quantity: 2 }] })
      .expect(201);

    const before = await prisma.inventory.findUnique({ where: { productId } });

    const address = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        label: 'Home',
        recipientName: 'Test Customer',
        phone: '+966501111111',
        city: 'Al Khafji',
        district: 'Center',
        street: 'Main St',
        isDefault: true,
      })
      .expect(201);
    addressId = address.body.data.id;

    const order = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        fulfilmentType: FulfilmentType.PICKUP,
        customerNote: 'e2e pickup',
      })
      .expect(201);

    orderId = order.body.data.id;
    orderItemId = order.body.data.items[0].id;
    expect(order.body.data.status).toBe(OrderStatus.PENDING);
    expect(Number(order.body.data.deliveryFee)).toBe(0);

    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(after!.reservedQuantity).toBe(before!.reservedQuantity + 2);
    expect(after!.quantity).toBe(before!.quantity);
  });

  it('confirms order and reduces quantity + reserved', async () => {
    const before = await prisma.inventory.findUnique({ where: { productId } });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: OrderStatus.CONFIRMED })
      .expect(200);

    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(after!.quantity).toBe(before!.quantity - 2);
    expect(after!.reservedQuantity).toBe(before!.reservedQuantity - 2);
  });

  it('rejects invalid status transitions', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: OrderStatus.OUT_FOR_DELIVERY })
      .expect(400);
  });

  it('cancels a confirmed order and restores quantity', async () => {
    const before = await prisma.inventory.findUnique({ where: { productId } });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: OrderStatus.CANCELLED,
        cancellationReason: 'Out of stock correction',
      })
      .expect(200);

    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(after!.quantity).toBe(before!.quantity + 2);
  });

  it('pending cancellation only releases reserved quantity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 5 })
      .expect(201);

    const before = await prisma.inventory.findUnique({ where: { productId } });

    const order = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        fulfilmentType: FulfilmentType.DELIVERY,
        addressId,
      })
      .expect(201);

    const reserved = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(reserved!.reservedQuantity).toBe(before!.reservedQuantity + 5);
    expect(reserved!.quantity).toBe(before!.quantity);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind' })
      .expect(201);

    const after = await prisma.inventory.findUnique({ where: { productId } });
    expect(after!.quantity).toBe(before!.quantity);
    expect(after!.reservedQuantity).toBe(before!.reservedQuantity);
  });

  it('rejects review until order is completed', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderItemId, rating: 5, comment: 'Great' })
      .expect(400);
  });

  it('allows review after completed order', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 3 })
      .expect(201);

    const placed = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ fulfilmentType: FulfilmentType.PICKUP })
      .expect(201);

    const id = placed.body.data.id;
    const itemId = placed.body.data.items[0].id;

    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ]) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ status })
        .expect(200);
    }

    const review = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderItemId: itemId, rating: 5, comment: 'Excellent' })
      .expect(201);

    expect(review.body.data.rating).toBe(5);
  });
});
