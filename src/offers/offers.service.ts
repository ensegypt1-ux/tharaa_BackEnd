import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiscountType, Offer, OfferScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingOfferInput } from '../pricing/pricing.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

type OfferWithProducts = Offer & {
  products: { productId: string }[];
};

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async listPublicActive() {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { products: true },
      orderBy: { startsAt: 'desc' },
    });
    return offers.map((o) => this.toPublic(o));
  }

  async findPublicById(id: string) {
    const now = new Date();
    const offer = await this.prisma.offer.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { products: true },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    return this.toPublic(offer);
  }

  async adminList() {
    const offers = await this.prisma.offer.findMany({
      where: { deletedAt: null },
      include: { products: true },
      orderBy: { createdAt: 'desc' },
    });
    return offers.map((o) => this.toAdmin(o));
  }

  async adminFindById(id: string) {
    const offer = await this.findExistingOrThrow(id);
    return this.toAdmin(offer);
  }

  async create(dto: CreateOfferDto) {
    this.validateScopePayload(dto);
    this.validateDateRange(dto.startsAt, dto.endsAt);
    this.validateDiscount(dto.discountType, dto.discountValue);

    if (dto.scope === OfferScope.CATEGORY && dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    if (dto.scope === OfferScope.PRODUCT && dto.productIds?.length) {
      await this.assertProductsExist(dto.productIds);
    }

    const offer = await this.prisma.offer.create({
      data: {
        titleAr: dto.titleAr.trim(),
        titleEn: dto.titleEn.trim(),
        scope: dto.scope,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        categoryId: dto.scope === OfferScope.CATEGORY ? dto.categoryId : null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        products:
          dto.scope === OfferScope.PRODUCT && dto.productIds?.length
            ? {
                create: dto.productIds.map((productId) => ({ productId })),
              }
            : undefined,
      },
      include: { products: true },
    });

    return this.toAdmin(offer);
  }

  async update(id: string, dto: UpdateOfferDto) {
    const existing = await this.findExistingOrThrow(id);

    const scope = dto.scope ?? existing.scope;
    const discountType = dto.discountType ?? existing.discountType;
    const discountValue =
      dto.discountValue !== undefined
        ? dto.discountValue
        : Number(existing.discountValue);
    const startsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const endsAt = dto.endsAt ?? existing.endsAt.toISOString();

    this.validateDateRange(startsAt, endsAt);
    this.validateDiscount(discountType, discountValue);

    if (scope === OfferScope.CATEGORY) {
      const categoryId =
        dto.categoryId !== undefined
          ? dto.categoryId
          : (existing.categoryId ?? undefined);
      if (!categoryId) {
        throw new BadRequestException(
          'categoryId is required for CATEGORY scope',
        );
      }
      await this.assertCategoryExists(categoryId);
    }

    if (scope === OfferScope.PRODUCT && dto.productIds) {
      if (dto.productIds.length === 0) {
        throw new BadRequestException(
          'productIds is required for PRODUCT scope',
        );
      }
      await this.assertProductsExist(dto.productIds);
    }

    const offer = await this.prisma.$transaction(async (tx) => {
      if (dto.productIds && scope === OfferScope.PRODUCT) {
        await tx.offerProduct.deleteMany({ where: { offerId: id } });
        await tx.offerProduct.createMany({
          data: dto.productIds.map((productId) => ({
            offerId: id,
            productId,
          })),
        });
      }

      if (scope === OfferScope.CATEGORY) {
        await tx.offerProduct.deleteMany({ where: { offerId: id } });
      }

      return tx.offer.update({
        where: { id },
        data: {
          ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr.trim() } : {}),
          ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn.trim() } : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
          ...(dto.discountType !== undefined
            ? { discountType: dto.discountType }
            : {}),
          ...(dto.discountValue !== undefined
            ? { discountValue: dto.discountValue }
            : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: new Date(dto.startsAt) }
            : {}),
          ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          categoryId:
            scope === OfferScope.CATEGORY
              ? (dto.categoryId ?? existing.categoryId)
              : null,
        },
        include: { products: true },
      });
    });

    return this.toAdmin(offer);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    await this.findExistingOrThrow(id);
    await this.prisma.offer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Offer deleted' };
  }

  async setImage(id: string, relativePath: string) {
    const offer = await this.findExistingOrThrow(id);

    if (offer.imagePath && offer.imagePath !== relativePath) {
      try {
        await this.storage.delete(offer.imagePath);
      } catch {
        // best-effort cleanup
      }
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: { imagePath: relativePath },
      include: { products: true },
    });
    return this.toAdmin(updated);
  }

  /**
   * Load currently active offers relevant to the given products/categories
   * for PricingService.calculateUnitPrice.
   */
  async loadActiveOffersForPricing(params: {
    productIds: string[];
    categoryIds: string[];
  }): Promise<PricingOfferInput[]> {
    const now = new Date();
    const productIds = [...new Set(params.productIds)];
    const categoryIds = [...new Set(params.categoryIds)];

    if (productIds.length === 0 && categoryIds.length === 0) {
      return [];
    }

    const offers = await this.prisma.offer.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          ...(productIds.length
            ? [
                {
                  scope: OfferScope.PRODUCT,
                  products: { some: { productId: { in: productIds } } },
                },
              ]
            : []),
          ...(categoryIds.length
            ? [
                {
                  scope: OfferScope.CATEGORY,
                  categoryId: { in: categoryIds },
                },
              ]
            : []),
        ],
      },
      include: { products: true },
    });

    return offers.map((offer) => this.toPricingInput(offer));
  }

  toPricingInput(offer: OfferWithProducts): PricingOfferInput {
    return {
      id: offer.id,
      scope: offer.scope,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      categoryId: offer.categoryId,
      productIds: offer.products.map((p) => p.productId),
    };
  }

  private async findExistingOrThrow(id: string): Promise<OfferWithProducts> {
    const offer = await this.prisma.offer.findFirst({
      where: { id, deletedAt: null },
      include: { products: true },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }

  private validateScopePayload(
    dto: Pick<CreateOfferDto, 'scope' | 'categoryId' | 'productIds'>,
  ) {
    if (dto.scope === OfferScope.CATEGORY && !dto.categoryId) {
      throw new BadRequestException(
        'categoryId is required for CATEGORY scope',
      );
    }
    if (
      dto.scope === OfferScope.PRODUCT &&
      (!dto.productIds || dto.productIds.length === 0)
    ) {
      throw new BadRequestException('productIds is required for PRODUCT scope');
    }
  }

  private validateDateRange(startsAt: string | Date, endsAt: string | Date) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(start < end)) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  private validateDiscount(type: DiscountType, value: number) {
    if (type === DiscountType.PERCENTAGE && (value < 0 || value > 100)) {
      throw new BadRequestException(
        'PERCENTAGE discountValue must be between 0 and 100',
      );
    }
    if (type === DiscountType.FIXED && value < 0) {
      throw new BadRequestException('FIXED discountValue must be >= 0');
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async assertProductsExist(productIds: string[]) {
    const count = await this.prisma.product.count({
      where: { id: { in: productIds }, deletedAt: null },
    });
    if (count !== productIds.length) {
      throw new NotFoundException('One or more products not found');
    }
  }

  private toPublic(offer: OfferWithProducts) {
    return {
      id: offer.id,
      titleAr: offer.titleAr,
      titleEn: offer.titleEn,
      scope: offer.scope,
      discountType: offer.discountType,
      discountValue: Number(offer.discountValue),
      categoryId: offer.categoryId,
      productIds: offer.products.map((p) => p.productId),
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      isActive: offer.isActive,
      imageUrl: offer.imagePath
        ? this.storage.getPublicUrl(offer.imagePath)
        : null,
    };
  }

  private toAdmin(offer: OfferWithProducts) {
    return {
      ...this.toPublic(offer),
      imagePath: offer.imagePath,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}
