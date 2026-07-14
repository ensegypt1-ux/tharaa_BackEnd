import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryImageFromUrlDto } from './dto/category-image-from-url.dto';
import { SearchCategoryImagesDto } from './dto/search-category-images.dto';

const PUBLIC_CATEGORIES_CACHE_KEY = 'categories:public';
const PUBLIC_CATEGORIES_TTL_SECONDS = 60;

export type PublicCategory = {
  id: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
  alt: string;
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async listPublic(): Promise<PublicCategory[]> {
    const cached = await this.redis.getJson<PublicCategory[]>(
      PUBLIC_CATEGORIES_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });

    const mapped = categories.map((c) => this.toPublic(c));
    await this.redis.setJson(
      PUBLIC_CATEGORIES_CACHE_KEY,
      mapped,
      PUBLIC_CATEGORIES_TTL_SECONDS,
    );
    return mapped;
  }

  async findPublicById(id: string): Promise<PublicCategory> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return this.toPublic(category);
  }

  async adminList() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const counts = await this.prisma.product.groupBy({
      by: ['categoryId', 'isActive'],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const countMap = new Map<string, { active: number; inactive: number }>();
    for (const row of counts) {
      const current = countMap.get(row.categoryId) ?? { active: 0, inactive: 0 };
      if (row.isActive) current.active += row._count._all;
      else current.inactive += row._count._all;
      countMap.set(row.categoryId, current);
    }

    const outOfStockRows = await this.prisma.$queryRaw<
      Array<{ categoryId: string; count: number }>
    >`
      SELECT p."categoryId" AS "categoryId", COUNT(*)::int AS count
      FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND (
          (p."hasVariants" = false AND EXISTS (
            SELECT 1 FROM "Inventory" i
            WHERE i."productId" = p.id
              AND (i.quantity - i."reservedQuantity") <= 0
          ))
          OR (p."hasVariants" = true AND NOT EXISTS (
            SELECT 1 FROM "ProductVariant" v
            INNER JOIN "Inventory" i ON i."variantId" = v.id
            WHERE v."productId" = p.id AND v."deletedAt" IS NULL
              AND (i.quantity - i."reservedQuantity") > 0
          ))
        )
      GROUP BY p."categoryId"
    `;
    const outOfStockMap = new Map(
      outOfStockRows.map((r) => [r.categoryId, Number(r.count)]),
    );

    return categories.map((c) => {
      const split = countMap.get(c.id) ?? { active: 0, inactive: 0 };
      return this.toAdmin(c, {
        productCount: split.active + split.inactive,
        activeProductCount: split.active,
        inactiveProductCount: split.inactive,
        outOfStockProductCount: outOfStockMap.get(c.id) ?? 0,
      });
    });
  }

  async adminFindById(id: string) {
    const category = await this.findExistingOrThrow(id);
    const [active, inactive, outOfStock] = await Promise.all([
      this.prisma.product.count({
        where: { categoryId: id, deletedAt: null, isActive: true },
      }),
      this.prisma.product.count({
        where: { categoryId: id, deletedAt: null, isActive: false },
      }),
      this.countOutOfStock(id),
    ]);
    return this.toAdmin(category, {
      productCount: active + inactive,
      activeProductCount: active,
      inactiveProductCount: inactive,
      outOfStockProductCount: outOfStock,
    });
  }

  async getStats(id: string) {
    await this.findExistingOrThrow(id);

    const products = await this.prisma.product.findMany({
      where: { categoryId: id, deletedAt: null },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        isActive: true,
        regularPrice: true,
        salePrice: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const activeProductCount = products.filter((p) => p.isActive).length;
    const inactiveProductCount = products.length - activeProductCount;
    const outOfStockProductCount = await this.countOutOfStock(id);

    const prices = products.map((p) =>
      Number(p.salePrice ?? p.regularPrice),
    );
    const averageProductPrice =
      prices.length > 0
        ? prices.reduce((sum, n) => sum + n, 0) / prices.length
        : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
    const last = products[0] ?? null;

    return {
      categoryId: id,
      productCount: products.length,
      activeProductCount,
      inactiveProductCount,
      outOfStockProductCount,
      averageProductPrice: Number(averageProductPrice.toFixed(2)),
      lowestPrice,
      highestPrice,
      lastUpdatedProduct: last
        ? {
            id: last.id,
            nameAr: last.nameAr,
            nameEn: last.nameEn,
            updatedAt: last.updatedAt,
          }
        : null,
    };
  }

  async create(dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data: {
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.invalidatePublicCache();
    return this.adminFindById(category.id);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findExistingOrThrow(id);

    await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.invalidatePublicCache();
    return this.adminFindById(id);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    await this.findExistingOrThrow(id);
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidatePublicCache();
    return { message: 'Category deleted' };
  }

  async setImage(id: string, relativePath: string) {
    const category = await this.findExistingOrThrow(id);

    if (category.imagePath && category.imagePath !== relativePath) {
      try {
        await this.storage.delete(category.imagePath);
      } catch {
        // best-effort cleanup
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { imagePath: relativePath },
    });
    await this.invalidatePublicCache();
    return this.adminFindById(updated.id);
  }

  async removeImage(id: string) {
    const category = await this.findExistingOrThrow(id);
    if (category.imagePath) {
      try {
        await this.storage.delete(category.imagePath);
      } catch {
        // best-effort cleanup
      }
    }
    await this.prisma.category.update({
      where: { id },
      data: { imagePath: null },
    });
    await this.invalidatePublicCache();
    return this.adminFindById(id);
  }

  async searchPexels(dto: SearchCategoryImagesDto) {
    const apiKey = this.config.get<string>('pexels.apiKey') || '';
    if (!apiKey) {
      throw new ServiceUnavailableException({
        message: 'Pexels API key is not configured',
        errorCode: 'PEXELS_MISSING_API_KEY',
      });
    }

    const query = dto.query.trim();
    const page = dto.page ?? 1;
    const perPage = dto.perPage ?? 15;
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('locale', 'en-US');

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: apiKey },
      });
    } catch {
      throw new ServiceUnavailableException({
        message: 'Pexels API is unavailable',
        errorCode: 'PEXELS_UNAVAILABLE',
      });
    }

    if (response.status === 429) {
      throw new ServiceUnavailableException({
        message: 'Pexels rate limit exceeded',
        errorCode: 'PEXELS_RATE_LIMITED',
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'Pexels API request failed',
        errorCode: 'PEXELS_UNAVAILABLE',
      });
    }

    const body = (await response.json()) as {
      total_results: number;
      page: number;
      per_page: number;
      photos: PexelsPhoto[];
    };

    return {
      query,
      page: body.page,
      perPage: body.per_page,
      total: body.total_results,
      results: (body.photos ?? []).map((p) => ({
        id: String(p.id),
        width: p.width,
        height: p.height,
        alt: p.alt,
        photographer: p.photographer,
        photographerUrl: p.photographer_url,
        sourceUrl: p.url,
        previewUrl: p.src.medium,
        imageUrl: p.src.large2x || p.src.large || p.src.original,
        sourceProvider: 'pexels',
      })),
    };
  }

  async setImageFromUrl(id: string, dto: CategoryImageFromUrlDto) {
    await this.findExistingOrThrow(id);
    const { buffer, mimeType } = await this.downloadImage(dto.imageUrl);
    const saved = await this.storage.save(buffer, 'categories', mimeType);
    return this.setImage(id, saved.path);
  }

  private async downloadImage(imageUrl: string) {
    let buffer: Buffer;
    let mimeType = 'image/jpeg';
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        throw new BadRequestException({
          message: 'Failed to download selected image',
          errorCode: 'IMAGE_DOWNLOAD_FAILED',
        });
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        throw new BadRequestException({
          message: 'Downloaded file is not a valid image',
          errorCode: 'INVALID_IMAGE',
        });
      }
      mimeType = contentType.split(';')[0].trim();
      const allowed =
        this.config.get<string[]>('storage.allowedMimes') ||
        ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(mimeType)) {
        throw new BadRequestException({
          message: 'Image type is not allowed',
          errorCode: 'INVALID_IMAGE',
        });
      }
      const arr = await res.arrayBuffer();
      buffer = Buffer.from(arr);
      if (!buffer.length) {
        throw new BadRequestException({
          message: 'Downloaded image is empty',
          errorCode: 'INVALID_IMAGE',
        });
      }
      const maxBytes =
        this.config.get<number>('storage.maxUploadBytes') || 5_242_880;
      if (buffer.length > maxBytes) {
        throw new BadRequestException({
          message: 'Image exceeds maximum upload size',
          errorCode: 'INVALID_IMAGE',
        });
      }
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new BadRequestException({
        message: 'Failed to download selected image',
        errorCode: 'IMAGE_DOWNLOAD_FAILED',
      });
    }
    return { buffer, mimeType };
  }

  private async countOutOfStock(categoryId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND p."categoryId" = ${categoryId}
        AND (
          (p."hasVariants" = false AND EXISTS (
            SELECT 1 FROM "Inventory" i
            WHERE i."productId" = p.id
              AND (i.quantity - i."reservedQuantity") <= 0
          ))
          OR (p."hasVariants" = true AND NOT EXISTS (
            SELECT 1 FROM "ProductVariant" v
            INNER JOIN "Inventory" i ON i."variantId" = v.id
            WHERE v."productId" = p.id AND v."deletedAt" IS NULL
              AND (i.quantity - i."reservedQuantity") > 0
          ))
        )
    `;
    return Number(rows[0]?.c ?? 0);
  }

  private async findExistingOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async invalidatePublicCache(): Promise<void> {
    await this.redis.del(PUBLIC_CATEGORIES_CACHE_KEY);
  }

  private toPublic(category: Category): PublicCategory {
    return {
      id: category.id,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      imageUrl: category.imagePath
        ? this.storage.getPublicUrl(category.imagePath)
        : null,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    };
  }

  private toAdmin(
    category: Category,
    counts?: {
      productCount: number;
      activeProductCount: number;
      inactiveProductCount: number;
      outOfStockProductCount: number;
    },
  ) {
    return {
      ...this.toPublic(category),
      imagePath: category.imagePath,
      hasImage: Boolean(category.imagePath),
      productCount: counts?.productCount ?? 0,
      activeProductCount: counts?.activeProductCount ?? 0,
      inactiveProductCount: counts?.inactiveProductCount ?? 0,
      outOfStockProductCount: counts?.outOfStockProductCount ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
