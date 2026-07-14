import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DeliveryService } from '../delivery/delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { Inject } from '@nestjs/common';
import { BootstrapResponseDto } from './dto/bootstrap-response.dto';

const BOOTSTRAP_CACHE_KEY = 'bootstrap:v1';
const BOOTSTRAP_CACHE_TTL_SECONDS = 60;

type JsonObject = Record<string, unknown>;

@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly delivery: DeliveryService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async getBootstrap(): Promise<BootstrapResponseDto> {
    const cached =
      await this.redis.getJson<BootstrapResponseDto>(BOOTSTRAP_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const [settingsRows, delivery, pickup] = await Promise.all([
      this.prisma.appSettings.findMany(),
      this.delivery.getDeliverySettings(),
      this.delivery.getPickupSettings(),
    ]);

    const settings = new Map(
      settingsRows.map((row) => [row.key, this.asObject(row.value)]),
    );

    const application = settings.get('bootstrap.application') ?? {};
    const localization = settings.get('bootstrap.localization') ?? {};
    const store = settings.get('bootstrap.store') ?? {};
    const payment = settings.get('bootstrap.payment') ?? {};
    const fulfilment = settings.get('bootstrap.fulfilment') ?? {};
    const notifications = settings.get('bootstrap.notifications') ?? {};
    const featureFlags = settings.get('bootstrap.featureFlags') ?? {};
    const authentication = settings.get('bootstrap.authentication') ?? {};

    const googleClientIds = this.config.get<string[]>('googleClientIds') ?? [];
    const googleLoginEnabled =
      Boolean(authentication.googleLoginEnabled) && googleClientIds.length > 0;

    const logoPath =
      typeof store.storeLogo === 'string' && store.storeLogo.length > 0
        ? store.storeLogo
        : null;

    const payload: BootstrapResponseDto = {
      application: {
        appName: String(application.appName ?? 'Tharaa Market'),
        environment: String(
          application.environment ??
            this.config.get<string>('nodeEnv') ??
            'development',
        ),
        apiVersion: String(application.apiVersion ?? '1.0.0'),
        maintenanceMode: Boolean(application.maintenanceMode ?? false),
        minimumSupportedVersion: String(
          application.minimumSupportedVersion ?? '1.0.0',
        ),
        latestVersion: String(application.latestVersion ?? '1.0.0'),
        forceUpdate: Boolean(application.forceUpdate ?? false),
      },
      localization: {
        defaultLanguage: String(localization.defaultLanguage ?? 'ar'),
        supportedLanguages: Array.isArray(localization.supportedLanguages)
          ? (localization.supportedLanguages as string[])
          : ['ar', 'en'],
      },
      store: {
        storeNameAr: String(store.storeNameAr ?? pickup.storeNameAr),
        storeNameEn: String(store.storeNameEn ?? pickup.storeNameEn),
        storeLogo: logoPath ? this.storage.getPublicUrl(logoPath) : null,
        supportPhone: String(store.supportPhone ?? '+966500000000'),
        supportEmail: String(store.supportEmail ?? 'support@tharaa.market'),
      },
      delivery: {
        deliveryEnabled: delivery.isEnabled,
        pickupEnabled: pickup.isEnabled,
        deliveryFee: Number(delivery.fee),
        freeDeliveryThreshold: Number(delivery.freeDeliveryThreshold ?? 0),
        minimumDeliveryOrder: Number(delivery.minOrderAmount),
        minimumPickupOrder: Number(pickup.minOrderAmount),
        estimatedDeliveryMinutes: {
          min: delivery.estimatedMinutesMin,
          max: delivery.estimatedMinutesMax,
        },
        estimatedPickupMinutes: {
          min: pickup.estimatedMinutesMin,
          max: pickup.estimatedMinutesMax,
        },
        serviceCity: delivery.serviceCity,
      },
      pickup: {
        storeNameAr: pickup.storeNameAr,
        storeNameEn: pickup.storeNameEn,
        storeAddressAr: pickup.addressAr,
        storeAddressEn: pickup.addressEn,
        latitude: Number(pickup.latitude),
        longitude: Number(pickup.longitude),
        workingHours: this.asObject(pickup.workingHoursJson),
      },
      payment: {
        supportedPaymentMethods: Array.isArray(payment.supportedPaymentMethods)
          ? (payment.supportedPaymentMethods as string[])
          : ['CASH_ON_DELIVERY'],
      },
      fulfilment: {
        supportedFulfilmentTypes: Array.isArray(
          fulfilment.supportedFulfilmentTypes,
        )
          ? (fulfilment.supportedFulfilmentTypes as string[])
          : ['DELIVERY', 'PICKUP'],
      },
      authentication: {
        googleLoginEnabled,
      },
      notifications: {
        notificationsEnabled: Boolean(
          notifications.notificationsEnabled ?? true,
        ),
      },
      featureFlags: {
        reviewsEnabled: Boolean(featureFlags.reviewsEnabled ?? true),
        couponsEnabled: Boolean(featureFlags.couponsEnabled ?? true),
        offersEnabled: Boolean(featureFlags.offersEnabled ?? true),
        inventoryEnabled: Boolean(featureFlags.inventoryEnabled ?? true),
        searchEnabled: Boolean(featureFlags.searchEnabled ?? true),
      },
    };

    await this.redis.setJson(
      BOOTSTRAP_CACHE_KEY,
      payload,
      BOOTSTRAP_CACHE_TTL_SECONDS,
    );

    return payload;
  }

  async invalidateCache(): Promise<void> {
    await this.redis.del(BOOTSTRAP_CACHE_KEY);
  }

  private asObject(value: Prisma.JsonValue | unknown): JsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }
    return {};
  }
}
