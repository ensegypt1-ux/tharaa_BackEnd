import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync, mkdirSync } from 'fs';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ApiErrorDto } from './common/swagger/api-error.dto';
import { ApiSuccessDto } from './common/swagger/api-success.dto';
import { BootstrapResponseDto } from './bootstrap/dto/bootstrap-response.dto';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const config = app.get(ConfigService);

  // Frozen API Version 1 prefix. Future major versions use a new prefix (e.g. api/v2).
  const apiPrefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const corsOrigins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const storageRoot = config.get<string>('storage.root', './storage');
  app.useStaticAssets(join(process.cwd(), storageRoot), {
    prefix: '/static/',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tharaa Market API')
    .setDescription(
      [
        'Official **Version 1** REST API contract for Tharaa Market (Al Khafji).',
        '',
        '### Stability',
        'This API is **frozen**. Breaking changes to URLs, request/response bodies, enums, pagination, auth, uploads, or error envelopes are not allowed in v1.',
        'Future incompatible changes must ship as `/api/v2`.',
        '',
        '### Response envelope',
        'Success: `{ success: true, data, meta? }`',
        'Error: `{ success: false, statusCode, message, errorCode?, details?, timestamp, path }`',
        '',
        '### Authentication',
        'Use `Authorization: Bearer <accessToken>`. Obtain tokens via `/auth/login`, `/auth/register`, `/auth/google`, or `/auth/refresh`.',
        'Refresh tokens rotate on every use.',
        '',
        '### Uploads',
        'Multipart form field name: `file`. Allowed MIME: jpeg, png, webp. Served under `/static/`.',
        '',
        '### Admin realtime (Socket.IO)',
        'Namespace `/admin` for staff dashboards. Authenticate with the JWT access token (`auth.token` or `Authorization: Bearer`).',
        'Events: `admin:order_created`, `admin:order_updated`. Roles: ADMIN, MANAGER, EMPLOYEE.',
        'Full contract: `docs/ADMIN_INTEGRATION.md` (Realtime section). REST remains the source of truth.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access JWT from auth endpoints',
    })
    .addTag('bootstrap', 'App startup configuration')
    .addTag('auth', 'Authentication and token management')
    .addTag('users', 'Customer profile and device tokens')
    .addTag('addresses', 'Customer delivery addresses')
    .addTag('categories', 'Public catalog categories')
    .addTag('products', 'Public catalog products and reviews')
    .addTag('cart', 'Authenticated shopping cart')
    .addTag('coupons', 'Coupon validation')
    .addTag('orders', 'Customer orders')
    .addTag('notifications', 'In-app notifications')
    .addTag('settings', 'Public store settings')
    .addTag('offers', 'Public offers')
    .addTag('health', 'Liveness and readiness')
    .addTag('admin-categories', 'Admin category management')
    .addTag('admin-products', 'Admin product management')
    .addTag('admin-inventory', 'Admin inventory adjustments')
    .addTag('admin-offers', 'Admin offers')
    .addTag('admin-coupons', 'Admin coupons')
    .addTag('admin-orders', 'Admin/employee order operations')
    .addTag('admin-reviews', 'Admin review moderation')
    .addTag('admin-notifications', 'Admin notification broadcast')
    .addTag('admin-delivery', 'Admin delivery and pickup settings')
    .addTag('admin-analytics', 'Admin dashboard analytics')
    .addTag('admin-customers', 'Admin customer management')
    .addTag('admin-settings', 'Admin AppSettings management')
    .addTag('admin-product-images', 'Admin Pexels image search')
    .addTag('admin-audit', 'Admin activity audit logs')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [ApiErrorDto, ApiSuccessDto, BootstrapResponseDto],
  });

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'Tharaa Market API v1',
  });

  // Persist official OpenAPI contract artifact for Flutter / CI consumption.
  const docsDir = join(process.cwd(), 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(
    join(docsDir, 'openapi-v1.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  logger.log(`Tharaa Market API v1 on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON: http://localhost:${port}/api/docs-json`);
}

bootstrap();
