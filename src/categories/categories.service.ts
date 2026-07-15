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
  parentId: string | null;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  /** True when recursive active product total is zero. */
  isEmpty?: boolean;
  children?: PublicCategory[];
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

    // One aggregation for all categories — direct active product counts only.
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    });
    const directCountMap = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );

    const mapped = categories.map((c) =>
      this.toPublic(c, { productCount: directCountMap.get(c.id) ?? 0 }),
    );
    const tree = this.buildPublicTree(mapped);
    this.applyRecursiveProductCounts(tree);
    await this.redis.setJson(
      PUBLIC_CATEGORIES_CACHE_KEY,
      tree,
      PUBLIC_CATEGORIES_TTL_SECONDS,
    );
    return tree;
  }

  async findPublicById(id: string): Promise<PublicCategory> {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const children = await this.prisma.category.findMany({
      where: {
        parentId: id,
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });

    const ids = [id, ...children.map((c) => c.id)];
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null, isActive: true, categoryId: { in: ids } },
      _count: { _all: true },
    });
    const directCountMap = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );

    const childNodes = children.map((c) => {
      const direct = directCountMap.get(c.id) ?? 0;
      return this.toPublic(c, {
        productCount: direct,
        isEmpty: direct === 0,
      });
    });
    const direct = directCountMap.get(category.id) ?? 0;
    const recursive =
      direct + childNodes.reduce((sum, c) => sum + (c.productCount ?? 0), 0);

    return {
      ...this.toPublic(category, {
        productCount: recursive,
        isEmpty: recursive === 0,
      }),
      children: childNodes,
    };
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

    const parentNameById = new Map(
      categories.map((c) => [c.id, { nameAr: c.nameAr, nameEn: c.nameEn }]),
    );

    const childIdsByParent = new Map<string, string[]>();
    for (const c of categories) {
      if (!c.parentId) continue;
      const list = childIdsByParent.get(c.parentId) ?? [];
      list.push(c.id);
      childIdsByParent.set(c.parentId, list);
    }

    return categories.map((c) => {
      const split = countMap.get(c.id) ?? { active: 0, inactive: 0 };
      const childIds = childIdsByParent.get(c.id) ?? [];
      let childrenProductCount = 0;
      for (const childId of childIds) {
        const childSplit = countMap.get(childId);
        if (childSplit) {
          childrenProductCount += childSplit.active + childSplit.inactive;
        }
      }
      const parent = c.parentId ? parentNameById.get(c.parentId) : null;
      return this.toAdmin(
        c,
        {
          productCount: split.active + split.inactive,
          activeProductCount: split.active,
          inactiveProductCount: split.inactive,
          outOfStockProductCount: outOfStockMap.get(c.id) ?? 0,
        },
        {
          parentNameAr: parent?.nameAr ?? null,
          parentNameEn: parent?.nameEn ?? null,
          childrenCount: childIds.length,
          childrenProductCount,
          totalProductCount: split.active + split.inactive + childrenProductCount,
        },
      );
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

    let parentNameAr: string | null = null;
    let parentNameEn: string | null = null;
    if (category.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: category.parentId, deletedAt: null },
        select: { nameAr: true, nameEn: true },
      });
      parentNameAr = parent?.nameAr ?? null;
      parentNameEn = parent?.nameEn ?? null;
    }

    const children = await this.prisma.category.findMany({
      where: { parentId: id, deletedAt: null },
      select: { id: true },
    });
    let childrenProductCount = 0;
    if (children.length) {
      childrenProductCount = await this.prisma.product.count({
        where: {
          deletedAt: null,
          categoryId: { in: children.map((c) => c.id) },
        },
      });
    }

    return this.toAdmin(
      category,
      {
        productCount: active + inactive,
        activeProductCount: active,
        inactiveProductCount: inactive,
        outOfStockProductCount: outOfStock,
      },
      {
        parentNameAr,
        parentNameEn,
        childrenCount: children.length,
        childrenProductCount,
        totalProductCount: active + inactive + childrenProductCount,
      },
    );
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
    const parentId = await this.resolveParentId(dto.parentId);
    const category = await this.prisma.category.create({
      data: {
        parentId,
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

    let parentId: string | null | undefined = undefined;
    if (dto.parentId !== undefined) {
      parentId = await this.resolveParentId(dto.parentId, id);
    }

    // Disallow turning a parent into a subcategory if it already has children.
    if (parentId) {
      const childCount = await this.prisma.category.count({
        where: { parentId: id, deletedAt: null },
      });
      if (childCount > 0) {
        throw new BadRequestException({
          message: 'Cannot nest a category that already has subcategories',
          errorCode: 'CATEGORY_HAS_CHILDREN',
        });
      }
    }

    await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
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

  private async resolveParentId(
    parentId: string | null | undefined,
    selfId?: string,
  ): Promise<string | null> {
    if (parentId === undefined || parentId === null || parentId === '') {
      return null;
    }
    if (selfId && parentId === selfId) {
      throw new BadRequestException({
        message: 'Category cannot be its own parent',
        errorCode: 'CATEGORY_CIRCULAR_PARENT',
      });
    }
    const parent = await this.prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent) {
      throw new BadRequestException({
        message: 'Parent category not found',
        errorCode: 'PARENT_CATEGORY_NOT_FOUND',
      });
    }
    if (parent.parentId) {
      throw new BadRequestException({
        message: 'Only one level of nesting is allowed',
        errorCode: 'CATEGORY_NESTING_DEPTH',
      });
    }
    return parent.id;
  }

  private buildPublicTree(flat: PublicCategory[]): PublicCategory[] {
    const byParent = new Map<string | null, PublicCategory[]>();
    for (const cat of flat) {
      const key = cat.parentId;
      const list = byParent.get(key) ?? [];
      list.push({ ...cat, children: [] });
      byParent.set(key, list);
    }
    const roots = byParent.get(null) ?? [];
    for (const root of roots) {
      root.children = byParent.get(root.id) ?? [];
    }
    return roots;
  }

  /**
   * After tree build (1 nesting level):
   * - children keep direct productCount
   * - parents get direct + sum(children)
   * - isEmpty uses the recursive total for each node
   */
  private applyRecursiveProductCounts(roots: PublicCategory[]): void {
    for (const root of roots) {
      const children = root.children ?? [];
      for (const child of children) {
        const direct = child.productCount ?? 0;
        child.isEmpty = direct === 0;
      }
      const childrenTotal = children.reduce(
        (sum, c) => sum + (c.productCount ?? 0),
        0,
      );
      const recursive = (root.productCount ?? 0) + childrenTotal;
      root.productCount = recursive;
      root.isEmpty = recursive === 0;
    }
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

  private toPublic(
    category: Category,
    extra?: { productCount?: number; isEmpty?: boolean },
  ): PublicCategory {
    return {
      id: category.id,
      parentId: category.parentId,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      imageUrl: category.imagePath
        ? this.storage.getPublicUrl(category.imagePath)
        : null,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      ...(extra?.productCount !== undefined
        ? { productCount: extra.productCount }
        : {}),
      ...(extra?.isEmpty !== undefined ? { isEmpty: extra.isEmpty } : {}),
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
    hierarchy?: {
      parentNameAr: string | null;
      parentNameEn: string | null;
      childrenCount: number;
      childrenProductCount: number;
      totalProductCount: number;
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
      parentNameAr: hierarchy?.parentNameAr ?? null,
      parentNameEn: hierarchy?.parentNameEn ?? null,
      childrenCount: hierarchy?.childrenCount ?? 0,
      childrenProductCount: hierarchy?.childrenProductCount ?? 0,
      totalProductCount:
        hierarchy?.totalProductCount ?? counts?.productCount ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
