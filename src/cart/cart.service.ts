import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfilmentType,
  OfferScope,
  Prisma,
  Product,
  ProductVariant,
} from '@prisma/client';
import { CouponsService } from '../coupons/coupons.service';
import { DeliveryService } from '../delivery/delivery.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto, SyncCartItemDto } from './dto/cart.dto';

type ProductWithRelations = Product & {
  variants: ProductVariant[];
  inventory: { quantity: number; reservedQuantity: number } | null;
  offerLinks: {
    offer: {
      id: string;
      scope: OfferScope;
      discountType: import('@prisma/client').DiscountType;
      discountValue: Prisma.Decimal;
      categoryId: string | null;
      isActive: boolean;
      startsAt: Date;
      endsAt: Date;
      deletedAt: Date | null;
      products: { productId: string }[];
    };
  }[];
};

const productInclude = {
  variants: { where: { deletedAt: null } },
  inventory: true,
  offerLinks: {
    include: {
      offer: {
        include: { products: true },
      },
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponsService,
    private readonly delivery: DeliveryService,
  ) {}

  async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findFirst({
      where: { userId, deletedAt: null },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.cart.create({
      data: { userId },
    });
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id, deletedAt: null },
      include: {
        product: { include: productInclude },
        variant: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const categoryIds = [
      ...new Set(items.map((item) => item.product.categoryId)),
    ];
    const categoryOffers =
      categoryIds.length > 0
        ? await this.prisma.offer.findMany({
            where: {
              scope: OfferScope.CATEGORY,
              categoryId: { in: categoryIds },
              isActive: true,
              deletedAt: null,
              startsAt: { lte: now },
              endsAt: { gte: now },
            },
            include: { products: true },
          })
        : [];

    const lineItems = items.map((item) => {
      const product = item.product as ProductWithRelations;
      const productOffers = this.collectOffers(product, now);
      const offers = [
        ...productOffers,
        ...categoryOffers.filter((o) => o.categoryId === product.categoryId),
      ];
      const priced = this.pricing.calculateUnitPrice({
        product,
        variant: item.variant,
        offers,
      });
      const lineTotal = Number((priced.unitPrice * item.quantity).toFixed(2));

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: priced.unitPrice,
        regularPrice: priced.regularPrice,
        discountAmount: priced.discountAmount,
        appliedOfferId: priced.appliedOfferId ?? null,
        lineTotal,
        product: {
          id: product.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          unit: product.unit,
          hasVariants: product.hasVariants,
          isActive: product.isActive,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              nameAr: item.variant.nameAr,
              nameEn: item.variant.nameEn,
              isActive: item.variant.isActive,
            }
          : null,
      };
    });

    const subtotal = Number(
      lineItems.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2),
    );

    let discountAmount = 0;
    let coupon: { code: string; discountAmount: number } | null = null;

    if (cart.couponCode) {
      try {
        const validated = await this.coupons.validateCoupon(
          cart.couponCode,
          userId,
          subtotal,
          cart.fulfilmentType ?? undefined,
        );
        discountAmount = validated.discountAmount;
        coupon = {
          code: validated.coupon.code,
          discountAmount,
        };
      } catch {
        await this.prisma.cart.update({
          where: { id: cart.id },
          data: { couponCode: null },
        });
        coupon = null;
        discountAmount = 0;
      }
    }

    let deliveryFee = 0;
    if (cart.fulfilmentType === FulfilmentType.DELIVERY) {
      deliveryFee = await this.delivery.computeDeliveryFee(subtotal);
    }

    const total = Number(
      Math.max(0, subtotal - discountAmount + deliveryFee).toFixed(2),
    );

    return {
      id: cart.id,
      userId: cart.userId,
      couponCode: coupon?.code ?? null,
      fulfilmentType: cart.fulfilmentType,
      items: lineItems,
      subtotal,
      discountAmount,
      deliveryFee,
      total,
      coupon,
    };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    await this.assertProductLineValid(
      dto.productId,
      dto.variantId,
      dto.quantity,
    );

    const existing = await this.findLine(
      cart.id,
      dto.productId,
      dto.variantId,
      true,
    );

    if (existing) {
      const nextQty =
        (existing.deletedAt ? 0 : existing.quantity) + dto.quantity;
      await this.assertStockAvailable(dto.productId, dto.variantId, nextQty);
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQty, deletedAt: null },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          variantId: dto.variantId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.assertStockAvailable(
      item.productId,
      item.variantId ?? undefined,
      quantity,
    );

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { deletedAt: new Date() },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.$transaction([
      this.prisma.cartItem.updateMany({
        where: { cartId: cart.id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
      this.prisma.cart.update({
        where: { id: cart.id },
        data: { couponCode: null },
      }),
    ]);

    return this.getCart(userId);
  }

  async applyCoupon(userId: string, code: string) {
    const cartView = await this.getCart(userId);
    if (cartView.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    await this.coupons.validateCoupon(
      code,
      userId,
      cartView.subtotal,
      cartView.fulfilmentType ?? undefined,
    );

    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: code.trim().toUpperCase() },
    });

    return this.getCart(userId);
  }

  async removeCoupon(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null },
    });
    return this.getCart(userId);
  }

  async setFulfilmentType(userId: string, fulfilmentType: FulfilmentType) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { fulfilmentType },
    });
    return this.getCart(userId);
  }

  async syncCart(userId: string, items: SyncCartItemDto[]) {
    const errors: string[] = [];
    const merges = new Map<
      string,
      { productId: string; variantId?: string; quantity: number }
    >();

    for (const [index, item] of items.entries()) {
      try {
        await this.assertProductLineValid(
          item.productId,
          item.variantId,
          item.quantity,
        );
        const key = this.lineKey(item.productId, item.variantId);
        const existing = merges.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          merges.set(key, {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Invalid cart item';
        errors.push(`items[${index}]: ${message}`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'One or more cart items are invalid',
        errors,
      });
    }

    for (const merge of merges.values()) {
      await this.assertStockAvailable(
        merge.productId,
        merge.variantId,
        merge.quantity,
      );
    }

    const cart = await this.getOrCreateCart(userId);

    for (const merge of merges.values()) {
      const existing = await this.findLine(
        cart.id,
        merge.productId,
        merge.variantId,
        true,
      );
      if (existing) {
        const nextQty =
          (existing.deletedAt ? 0 : existing.quantity) + merge.quantity;
        await this.assertStockAvailable(
          merge.productId,
          merge.variantId,
          nextQty,
        );
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: nextQty, deletedAt: null },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: merge.productId,
            variantId: merge.variantId,
            quantity: merge.quantity,
          },
        });
      }
    }

    return this.getCart(userId);
  }

  private collectOffers(product: ProductWithRelations, now: Date) {
    const fromLinks = product.offerLinks
      .map((link) => link.offer)
      .filter(
        (offer) =>
          offer &&
          offer.isActive &&
          !offer.deletedAt &&
          offer.startsAt <= now &&
          offer.endsAt >= now,
      );

    return fromLinks;
  }

  private lineKey(productId: string, variantId?: string | null) {
    return `${productId}:${variantId ?? 'null'}`;
  }

  private async findLine(
    cartId: string,
    productId: string,
    variantId?: string | null,
    includeDeleted = false,
  ) {
    const where: Prisma.CartItemWhereInput = {
      cartId,
      productId,
      ...(variantId ? { variantId } : { variantId: null }),
      ...(includeDeleted ? {} : { deletedAt: null }),
    };

    return this.prisma.cartItem.findFirst({ where });
  }

  private async assertProductLineValid(
    productId: string,
    variantId: string | undefined,
    quantity: number,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        variants: { where: { deletedAt: null, isActive: true } },
        inventory: true,
      },
    });

    if (!product || !product.isActive) {
      throw new BadRequestException('Product is unavailable');
    }

    if (product.hasVariants) {
      if (!variantId) {
        throw new BadRequestException('variantId is required for this product');
      }
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) {
        throw new BadRequestException('Variant is unavailable');
      }
    } else if (variantId) {
      throw new BadRequestException(
        'variantId must not be provided for products without variants',
      );
    }

    await this.assertStockAvailable(productId, variantId, quantity);
  }

  private async assertStockAvailable(
    productId: string,
    variantId: string | undefined,
    quantity: number,
  ) {
    const inventory = variantId
      ? await this.prisma.inventory.findFirst({ where: { variantId } })
      : await this.prisma.inventory.findFirst({
          where: { productId, variantId: null },
        });

    if (!inventory) {
      throw new BadRequestException('Stock information unavailable');
    }

    const available = inventory.quantity - inventory.reservedQuantity;
    if (quantity > available) {
      throw new BadRequestException(
        `Insufficient stock (available: ${available})`,
      );
    }
  }
}
