import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliverySettings, PickupSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { UpdatePickupSettingsDto } from './dto/update-pickup-settings.dto';

const PUBLIC_SETTINGS_CACHE_KEY = 'settings:public';
const PUBLIC_SETTINGS_TTL_SECONDS = 60;

export type PublicSettings = {
  delivery: DeliverySettings;
  pickup: PickupSettings;
  serviceCity: string;
};

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getDeliverySettings(): Promise<DeliverySettings> {
    const existing = await this.prisma.deliverySettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.deliverySettings.create({
      data: {
        isEnabled: true,
        fee: 15,
        freeDeliveryThreshold: 100,
        minOrderAmount: 20,
        estimatedMinutesMin: 30,
        estimatedMinutesMax: 60,
        serviceCity: 'Al Khafji',
      },
    });
  }

  async getPickupSettings(): Promise<PickupSettings> {
    const existing = await this.prisma.pickupSettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.pickupSettings.create({
      data: {
        isEnabled: true,
        minOrderAmount: 0,
        estimatedMinutesMin: 15,
        estimatedMinutesMax: 30,
        storeNameAr: 'ثرى ماركت',
        storeNameEn: 'Tharaa Market',
        addressAr: 'الخفجي',
        addressEn: 'Al Khafji',
        latitude: 28.4391,
        longitude: 48.4913,
        workingHoursJson: {
          sunday: { open: '09:00', close: '22:00' },
          monday: { open: '09:00', close: '22:00' },
          tuesday: { open: '09:00', close: '22:00' },
          wednesday: { open: '09:00', close: '22:00' },
          thursday: { open: '09:00', close: '22:00' },
          friday: { open: '14:00', close: '22:00' },
          saturday: { open: '09:00', close: '22:00' },
        },
      },
    });
  }

  async getPublicSettings(): Promise<PublicSettings> {
    const cached = await this.redis.getJson<PublicSettings>(
      PUBLIC_SETTINGS_CACHE_KEY,
    );
    if (cached) {
      return {
        ...cached,
        delivery: this.reviveDelivery(cached.delivery),
        pickup: this.revivePickup(cached.pickup),
      };
    }

    const [delivery, pickup] = await Promise.all([
      this.getDeliverySettings(),
      this.getPickupSettings(),
    ]);

    const payload: PublicSettings = {
      delivery,
      pickup,
      serviceCity: delivery.serviceCity,
    };

    await this.redis.setJson(
      PUBLIC_SETTINGS_CACHE_KEY,
      payload,
      PUBLIC_SETTINGS_TTL_SECONDS,
    );

    return payload;
  }

  async updateDelivery(
    dto: UpdateDeliverySettingsDto,
  ): Promise<DeliverySettings> {
    const current = await this.getDeliverySettings();

    if (dto.serviceCity !== undefined) {
      const city = dto.serviceCity.trim();
      if (city.toLowerCase() !== 'al khafji') {
        throw new BadRequestException(
          'Only Al Khafji is supported as service city',
        );
      }
    }

    const updated = await this.prisma.deliverySettings.update({
      where: { id: current.id },
      data: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.fee !== undefined ? { fee: dto.fee } : {}),
        ...(dto.freeDeliveryThreshold !== undefined
          ? { freeDeliveryThreshold: dto.freeDeliveryThreshold }
          : {}),
        ...(dto.minOrderAmount !== undefined
          ? { minOrderAmount: dto.minOrderAmount }
          : {}),
        ...(dto.estimatedMinutesMin !== undefined
          ? { estimatedMinutesMin: dto.estimatedMinutesMin }
          : {}),
        ...(dto.estimatedMinutesMax !== undefined
          ? { estimatedMinutesMax: dto.estimatedMinutesMax }
          : {}),
        ...(dto.serviceCity !== undefined
          ? { serviceCity: dto.serviceCity.trim() }
          : {}),
      },
    });

    await this.invalidatePublicSettingsCache();
    return updated;
  }

  async updatePickup(dto: UpdatePickupSettingsDto): Promise<PickupSettings> {
    const current = await this.getPickupSettings();

    const updated = await this.prisma.pickupSettings.update({
      where: { id: current.id },
      data: {
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.minOrderAmount !== undefined
          ? { minOrderAmount: dto.minOrderAmount }
          : {}),
        ...(dto.estimatedMinutesMin !== undefined
          ? { estimatedMinutesMin: dto.estimatedMinutesMin }
          : {}),
        ...(dto.estimatedMinutesMax !== undefined
          ? { estimatedMinutesMax: dto.estimatedMinutesMax }
          : {}),
        ...(dto.storeNameAr !== undefined
          ? { storeNameAr: dto.storeNameAr }
          : {}),
        ...(dto.storeNameEn !== undefined
          ? { storeNameEn: dto.storeNameEn }
          : {}),
        ...(dto.addressAr !== undefined ? { addressAr: dto.addressAr } : {}),
        ...(dto.addressEn !== undefined ? { addressEn: dto.addressEn } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.workingHoursJson !== undefined
          ? {
              workingHoursJson: dto.workingHoursJson as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    await this.invalidatePublicSettingsCache();
    return updated;
  }

  async computeDeliveryFee(subtotal: number): Promise<number> {
    const settings = await this.getDeliverySettings();
    const threshold =
      settings.freeDeliveryThreshold != null
        ? Number(settings.freeDeliveryThreshold)
        : null;

    if (threshold !== null && subtotal >= threshold) {
      return 0;
    }

    return Number(settings.fee);
  }

  async invalidatePublicSettingsCache(): Promise<void> {
    await this.redis.del(PUBLIC_SETTINGS_CACHE_KEY, 'bootstrap:v1');
  }

  private reviveDelivery(raw: DeliverySettings): DeliverySettings {
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }

  private revivePickup(raw: PickupSettings): PickupSettings {
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
    };
  }
}
