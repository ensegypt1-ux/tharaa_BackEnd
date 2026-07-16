import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { AdminAuditModule } from './admin-audit/admin-audit.module';
import { AdminCustomersModule } from './admin-customers/admin-customers.module';
import { AdminProductImagesModule } from './admin-product-images/admin-product-images.module';
import { AdminRealtimeModule } from './admin-realtime/admin-realtime.module';
import { AdminSettingsModule } from './admin-settings/admin-settings.module';
import { AddressesModule } from './addresses/addresses.module';
import { AuthModule } from './auth/auth.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { CouponsModule } from './coupons/coupons.module';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { OffersModule } from './offers/offers.module';
import { OrdersModule } from './orders/orders.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
          limit: config.get<number>('throttle.limit') ?? 100,
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    UploadsModule,
    AdminAuditModule,
    AdminRealtimeModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    HealthModule,
    BootstrapModule,
    PricingModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    OffersModule,
    CampaignsModule,
    CouponsModule,
    DeliveryModule,
    CartModule,
    NotificationsModule,
    OrdersModule,
    ReviewsModule,
    SearchModule,
    WishlistModule,
    AdminAnalyticsModule,
    AdminCustomersModule,
    AdminSettingsModule,
    AdminProductImagesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
