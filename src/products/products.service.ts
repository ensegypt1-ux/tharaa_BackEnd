import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  Inventory,
  Prisma,
  Product,
  ProductImage,
  ProductVariant,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import { OffersService } from '../offers/offers.service';
import { RedisService } from '../redis/redis.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

const PUBLIC_CATEGORIES_CACHE_KEY = 'categories:public';

type ProductRelations = {
  images: ProductImage[];
  variants: (ProductVariant & { inventory: Inventory | null })[];
  inventory: Inventory | null;
  category: Pick<Category, 'id' | 'nameAr' | 'nameEn'> | null;
};

type ProductWithRelations = Product & ProductRelations;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly inventoryService: InventoryService,
    private readonly offersService: OffersService,
    private readonly redis: RedisService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async listPublic(dto: ListProductsDto) {
    const where = await this.buildListWhere(dto, { publicOnly: true });
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.productInclude(),
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const mapped = await this.mapProductsWithPricing(products);
    return {
      data: mapped,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findPublicById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, isActive: true },
      include: this.productInclude(),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const [mapped] = await this.mapProductsWithPricing([product]);
    return mapped;
  }

  async adminList(dto: ListProductsDto) {
    const where = await this.buildListWhere(dto, { publicOnly: false });
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortDir = dto.sortDir ?? 'desc';

    let orderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
    ];
    if (dto.sortBy === 'name') {
      orderBy = [{ nameEn: sortDir }, { nameAr: sortDir }];
    } else if (dto.sortBy === 'price') {
      orderBy = [{ regularPrice: sortDir }];
    } else if (dto.sortBy === 'newest') {
      orderBy = [{ createdAt: sortDir }];
    }

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.productInclude(),
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    let mapped = await this.mapProductsWithPricing(products);

    if (dto.sortBy === 'stock') {
      mapped = [...mapped].sort((a, b) => {
        const av = a.availableQuantity ?? 0;
        const bv = b.availableQuantity ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    }

    return {
      data: mapped,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async adminFindById(id: string) {
    const product = await this.findExistingOrThrow(id);
    const [mapped] = await this.mapProductsWithPricing([product]);
    return mapped;
  }

  async create(dto: CreateProductDto) {
    await this.assertCategoryExists(dto.categoryId);

    if (dto.sku) {
      await this.assertSkuAvailable(dto.sku);
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          categoryId: dto.categoryId,
          nameAr: dto.nameAr.trim(),
          nameEn: dto.nameEn.trim(),
          descriptionAr: dto.descriptionAr?.trim(),
          descriptionEn: dto.descriptionEn?.trim(),
          sku: dto.sku?.trim() || null,
          unit: dto.unit.trim(),
          hasVariants: dto.hasVariants ?? false,
          regularPrice: dto.regularPrice,
          salePrice: dto.salePrice ?? null,
          isActive: dto.isActive ?? true,
          isFeatured: dto.isFeatured ?? false,
          isBestSeller: dto.isBestSeller ?? false,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
        },
      });

      if (!(dto.hasVariants ?? false)) {
        await tx.inventory.create({
          data: {
            productId: created.id,
            quantity: dto.initialQuantity ?? 0,
            reservedQuantity: 0,
          },
        });
      }

      return created;
    });

    await this.redis.del(PUBLIC_CATEGORIES_CACHE_KEY);
    return this.adminFindById(product.id);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findExistingOrThrow(id);

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    if (dto.sku !== undefined && dto.sku) {
      await this.assertSkuAvailable(dto.sku, id);
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.descriptionAr !== undefined
          ? { descriptionAr: dto.descriptionAr?.trim() ?? null }
          : {}),
        ...(dto.descriptionEn !== undefined
          ? { descriptionEn: dto.descriptionEn?.trim() ?? null }
          : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
        ...(dto.hasVariants !== undefined
          ? { hasVariants: dto.hasVariants }
          : {}),
        ...(dto.regularPrice !== undefined
          ? { regularPrice: dto.regularPrice }
          : {}),
        ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.isBestSeller !== undefined
          ? { isBestSeller: dto.isBestSeller }
          : {}),
        ...(dto.lowStockThreshold !== undefined
          ? { lowStockThreshold: dto.lowStockThreshold }
          : {}),
      },
    });

    if (dto.hasVariants === false) {
      await this.inventoryService.ensureInventory({ productId: id });
    }

    await this.redis.del(PUBLIC_CATEGORIES_CACHE_KEY);
    return this.adminFindById(id);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    await this.findExistingOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.redis.del(PUBLIC_CATEGORIES_CACHE_KEY);
    return { message: 'Product deleted' };
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.findExistingOrThrow(productId);

    if (dto.sku) {
      await this.assertVariantSkuAvailable(dto.sku);
    }

    const variant = await this.prisma.$transaction(async (tx) => {
      if (!product.hasVariants) {
        await tx.product.update({
          where: { id: productId },
          data: { hasVariants: true },
        });
      }

      const created = await tx.productVariant.create({
        data: {
          productId,
          nameAr: dto.nameAr.trim(),
          nameEn: dto.nameEn.trim(),
          sku: dto.sku?.trim() || null,
          price: dto.price,
          salePrice: dto.salePrice ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      await tx.inventory.create({
        data: {
          variantId: created.id,
          quantity: dto.initialQuantity ?? 0,
          reservedQuantity: 0,
        },
      });

      return created;
    });

    return this.mapVariant(
      await this.findVariantOrThrow(productId, variant.id),
      product,
    );
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    await this.findExistingOrThrow(productId);
    await this.findVariantOrThrow(productId, variantId);

    if (dto.sku !== undefined && dto.sku) {
      await this.assertVariantSkuAvailable(dto.sku, variantId);
    }

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    const product = await this.findExistingOrThrow(productId);
    return this.mapVariant(
      await this.findVariantOrThrow(productId, variantId),
      product,
    );
  }

  async softDeleteVariant(
    productId: string,
    variantId: string,
  ): Promise<{ message: string }> {
    await this.findVariantOrThrow(productId, variantId);
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Variant deleted' };
  }

  async addImage(
    productId: string,
    relativePath: string,
    options?: {
      isPrimary?: boolean;
      sortOrder?: number;
      sourceUrl?: string;
      attribution?: string;
      photographer?: string;
      sourceProvider?: string;
    },
  ) {
    await this.findExistingOrThrow(productId);

    const image = await this.prisma.$transaction(async (tx) => {
      const makePrimary = options?.isPrimary ?? false;

      if (makePrimary) {
        await tx.productImage.updateMany({
          where: { productId, deletedAt: null },
          data: { isPrimary: false },
        });
      }

      const existingCount = await tx.productImage.count({
        where: { productId, deletedAt: null },
      });

      return tx.productImage.create({
        data: {
          productId,
          path: relativePath,
          sortOrder: options?.sortOrder ?? existingCount,
          isPrimary: makePrimary || existingCount === 0,
          sourceUrl: options?.sourceUrl ?? null,
          attribution: options?.attribution ?? null,
          photographer: options?.photographer ?? null,
          sourceProvider: options?.sourceProvider ?? null,
        },
      });
    });

    return this.mapImage(image);
  }

  async setPrimaryImage(productId: string, imageId: string) {
    await this.findExistingOrThrow(productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, deletedAt: null },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId, deletedAt: null },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    return this.adminFindById(productId);
  }

  async deleteImage(
    productId: string,
    imageId: string,
  ): Promise<{ message: string }> {
    await this.findExistingOrThrow(productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, deletedAt: null },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { deletedAt: new Date(), isPrimary: false },
    });

    try {
      await this.storage.delete(image.path);
    } catch {
      // best-effort cleanup
    }

    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image deleted' };
  }

  private async buildListWhere(
    dto: ListProductsDto,
    options: { publicOnly: boolean },
  ): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(options.publicOnly ? { isActive: true } : {}),
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.isBestSeller !== undefined
        ? { isBestSeller: dto.isBestSeller }
        : {}),
    };

    if (dto.categoryId) {
      where.categoryId = await this.resolveCategoryIdFilter(
        dto.categoryId,
        dto.includeChildren,
      );
    }

    if (!options.publicOnly && dto.isActive !== undefined) {
      where.isActive = dto.isActive;
    }

    if (dto.q?.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (dto.missingImages === true) {
      where.images = { none: { deletedAt: null } };
    }

    if (dto.inStock !== undefined) {
      const stockIds = await this.findInStockProductIds(dto.inStock);
      where.id = { in: stockIds.length ? stockIds : ['__none__'] };
    }

    if (dto.lowStock === true) {
      const lowIds = await this.findLowStockProductIds();
      const existing = where.id;
      if (existing && typeof existing === 'object' && 'in' in existing) {
        const set = new Set(existing.in as string[]);
        where.id = { in: lowIds.filter((id) => set.has(id)) };
      } else {
        where.id = { in: lowIds.length ? lowIds : ['__none__'] };
      }
    }

    return where;
  }

  private async findLowStockProductIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM "Product" p
      INNER JOIN "Inventory" i ON i."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND p."hasVariants" = false
        AND (i.quantity - i."reservedQuantity") > 0
        AND (i.quantity - i."reservedQuantity") <= p."lowStockThreshold"
    `;
    return rows.map((r) => r.id);
  }

  private async findInStockProductIds(inStock: boolean): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND (
          (
            p."hasVariants" = false
            AND EXISTS (
              SELECT 1
              FROM "Inventory" i
              WHERE i."productId" = p.id
                AND (i.quantity - i."reservedQuantity") > 0
            )
          )
          OR (
            p."hasVariants" = true
            AND EXISTS (
              SELECT 1
              FROM "ProductVariant" v
              INNER JOIN "Inventory" i ON i."variantId" = v.id
              WHERE v."productId" = p.id
                AND v."deletedAt" IS NULL
                AND v."isActive" = true
                AND (i.quantity - i."reservedQuantity") > 0
            )
          )
        )
    `;

    const inStockIds = rows.map((r) => r.id);
    if (inStock) {
      return inStockIds;
    }

    const all = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    const inStockSet = new Set(inStockIds);
    return all.map((p) => p.id).filter((id) => !inStockSet.has(id));
  }

  private productInclude() {
    return {
      category: {
        select: { id: true, nameAr: true, nameEn: true },
      },
      images: {
        where: { deletedAt: null },
        orderBy: [
          { isPrimary: 'desc' as const },
          { sortOrder: 'asc' as const },
        ],
      },
      variants: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' as const }],
        include: { inventory: true },
      },
      inventory: true,
    };
  }

  private async mapProductsWithPricing(products: ProductWithRelations[]) {
    if (products.length === 0) {
      return [];
    }

    const offers = await this.offersService.loadActiveOffersForPricing({
      productIds: products.map((p) => p.id),
      categoryIds: products.map((p) => p.categoryId),
    });

    return products.map((product) => {
      const basePrice = this.pricing.calculateUnitPrice({
        product,
        offers,
      });

      const variants = product.variants.map((variant) => {
        const pricing = this.pricing.calculateUnitPrice({
          product,
          variant,
          offers,
        });
        const available = variant.inventory
          ? this.inventoryService.getAvailable(variant.inventory)
          : 0;

        return {
          id: variant.id,
          nameAr: variant.nameAr,
          nameEn: variant.nameEn,
          sku: variant.sku,
          price: Number(variant.price),
          salePrice:
            variant.salePrice !== null && variant.salePrice !== undefined
              ? Number(variant.salePrice)
              : null,
          isActive: variant.isActive,
          sortOrder: variant.sortOrder,
          effectivePrice: pricing,
          inventory: variant.inventory
            ? {
                quantity: variant.inventory.quantity,
                reservedQuantity: variant.inventory.reservedQuantity,
                available,
              }
            : null,
        };
      });

      const productAvailable = product.inventory
        ? this.inventoryService.getAvailable(product.inventory)
        : variants.reduce((sum, v) => sum + (v.inventory?.available ?? 0), 0);

      return {
        id: product.id,
        categoryId: product.categoryId,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        descriptionAr: product.descriptionAr,
        descriptionEn: product.descriptionEn,
        sku: product.sku,
        unit: product.unit,
        hasVariants: product.hasVariants,
        regularPrice: Number(product.regularPrice),
        salePrice:
          product.salePrice !== null && product.salePrice !== undefined
            ? Number(product.salePrice)
            : null,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        lowStockThreshold: product.lowStockThreshold,
        ratingAverage: Number(product.ratingAverage),
        ratingCount: product.ratingCount,
        effectivePrice: basePrice,
        category: product.category
          ? {
              id: product.category.id,
              nameAr: product.category.nameAr,
              nameEn: product.category.nameEn,
            }
          : null,
        imageCount: product.images.length,
        images: product.images.map((img) => this.mapImage(img)),
        variants,
        inventory: product.inventory
          ? {
              quantity: product.inventory.quantity,
              reservedQuantity: product.inventory.reservedQuantity,
              available: this.inventoryService.getAvailable(product.inventory),
            }
          : null,
        availableQuantity: productAvailable,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });
  }

  private async mapVariant(
    variant: ProductVariant & { inventory: Inventory | null },
    product: Product,
  ) {
    const offers = await this.offersService.loadActiveOffersForPricing({
      productIds: [product.id],
      categoryIds: [product.categoryId],
    });
    const pricing = this.pricing.calculateUnitPrice({
      product,
      variant,
      offers,
    });

    return {
      id: variant.id,
      productId: variant.productId,
      nameAr: variant.nameAr,
      nameEn: variant.nameEn,
      sku: variant.sku,
      price: Number(variant.price),
      salePrice:
        variant.salePrice !== null && variant.salePrice !== undefined
          ? Number(variant.salePrice)
          : null,
      isActive: variant.isActive,
      sortOrder: variant.sortOrder,
      effectivePrice: pricing,
      inventory: variant.inventory
        ? {
            quantity: variant.inventory.quantity,
            reservedQuantity: variant.inventory.reservedQuantity,
            available: this.inventoryService.getAvailable(variant.inventory),
          }
        : null,
    };
  }

  private mapImage(image: ProductImage) {
    return {
      id: image.id,
      path: image.path,
      url: this.storage.getPublicUrl(image.path),
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
      sourceUrl: image.sourceUrl ?? null,
      attribution: image.attribution ?? null,
      photographer: image.photographer ?? null,
      sourceProvider: image.sourceProvider ?? null,
    };
  }

  private async findExistingOrThrow(id: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: this.productInclude(),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private async findVariantOrThrow(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant & { inventory: Inventory | null }> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
      include: { inventory: true },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    return variant;
  }

  async bulkReassign(dto: {
    productIds: string[];
    categoryId: string;
  }): Promise<{ updated: number; categoryId: string }> {
    await this.assertCategoryExists(dto.categoryId);
    const uniqueIds = [...new Set(dto.productIds)];
    const result = await this.prisma.product.updateMany({
      where: {
        id: { in: uniqueIds },
        deletedAt: null,
      },
      data: { categoryId: dto.categoryId },
    });
    return { updated: result.count, categoryId: dto.categoryId };
  }

  /**
   * Resolve product categoryId filter.
   *
   * - includeChildren === false → direct category only
   * - includeChildren === true → category + direct children
   * - includeChildren omitted → parents (with children) expand to descendants;
   *   leaf/child categories stay direct-only
   *
   * One extra query max (children of this id). No per-child queries.
   */
  private async resolveCategoryIdFilter(
    categoryId: string,
    includeChildren?: boolean | string | number,
  ): Promise<string | { in: string[] }> {
    const flag = this.normalizeOptionalBoolean(includeChildren);
    if (flag === false) {
      return categoryId;
    }

    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId, deletedAt: null },
      select: { id: true },
    });

    if (flag === true || children.length > 0) {
      return { in: [categoryId, ...children.map((c) => c.id)] };
    }

    return categoryId;
  }

  /** Handles query-string / implicit-conversion edge cases for booleans. */
  private normalizeOptionalBoolean(
    value: unknown,
  ): boolean | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === true || value === 1 || value === '1' || value === 'true') {
      return true;
    }
    if (value === false || value === 0 || value === '0' || value === 'false') {
      return false;
    }
    return undefined;
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async assertSkuAvailable(sku: string, excludeId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: {
        sku,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException('Product SKU already in use');
    }
  }

  private async assertVariantSkuAvailable(sku: string, excludeId?: string) {
    const existing = await this.prisma.productVariant.findFirst({
      where: {
        sku,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException('Variant SKU already in use');
    }
  }
}
