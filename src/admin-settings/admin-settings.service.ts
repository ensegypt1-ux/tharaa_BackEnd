import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PatchAppSettingsDto } from './dto/app-settings.dto';

const BOOTSTRAP_CACHE_KEY = 'bootstrap:v1';

const BOOTSTRAP_KEY_MAP: Record<string, string> = {
  store: 'bootstrap.store',
  application: 'bootstrap.application',
  localization: 'bootstrap.localization',
  notifications: 'bootstrap.notifications',
  featureFlags: 'bootstrap.featureFlags',
  authentication: 'bootstrap.authentication',
  payment: 'bootstrap.payment',
  fulfilment: 'bootstrap.fulfilment',
};

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listAll() {
    const rows = await this.prisma.appSettings.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updatedAt,
    }));
  }

  async getByKey(key: string) {
    const row = await this.prisma.appSettings.findUnique({ where: { key } });
    if (!row) {
      throw new NotFoundException('Setting not found');
    }
    return {
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt,
    };
  }

  async upsert(key: string, value: unknown) {
    const row = await this.prisma.appSettings.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    await this.invalidateBootstrapCache();
    return {
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt,
    };
  }

  async patchBootstrap(dto: PatchAppSettingsDto) {
    const merge = dto.merge !== false;
    const results: { key: string; value: unknown; updatedAt: Date }[] = [];

    for (const [field, dbKey] of Object.entries(BOOTSTRAP_KEY_MAP)) {
      const incoming = (dto as Record<string, unknown>)[field];
      if (!incoming || typeof incoming !== 'object') {
        continue;
      }

      let nextValue: Record<string, unknown> = {
        ...(incoming as Record<string, unknown>),
      };

      if (merge) {
        const existing = await this.prisma.appSettings.findUnique({
          where: { key: dbKey },
        });
        if (
          existing?.value &&
          typeof existing.value === 'object' &&
          !Array.isArray(existing.value)
        ) {
          nextValue = {
            ...(existing.value as Record<string, unknown>),
            ...nextValue,
          };
        }
      }

      results.push(await this.upsert(dbKey, nextValue));
    }

    await this.invalidateBootstrapCache();
    return results;
  }

  private async invalidateBootstrapCache(): Promise<void> {
    await this.redis.del(BOOTSTRAP_CACHE_KEY);
  }
}
