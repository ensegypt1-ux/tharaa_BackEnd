import { Injectable } from '@nestjs/common';
import {
  DiscountType,
  OfferScope,
  type Product,
  type ProductVariant,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type PricingOfferInput = {
  id: string;
  scope: OfferScope;
  discountType: DiscountType;
  discountValue: Decimal | number | string;
  categoryId?: string | null;
  /** Product IDs linked when scope is PRODUCT */
  productIds?: string[];
};

export type CalculateUnitPriceInput = {
  product: Pick<Product, 'id' | 'categoryId' | 'regularPrice' | 'salePrice'>;
  variant?: Pick<ProductVariant, 'id' | 'price' | 'salePrice'> | null;
  offers?: PricingOfferInput[];
};

export type UnitPriceResult = {
  unitPrice: number;
  regularPrice: number;
  discountAmount: number;
  appliedOfferId?: string;
};

@Injectable()
export class PricingService {
  calculateOfferPrice(
    base: number,
    discountType: DiscountType,
    discountValue: number,
  ): number {
    const baseNum = Number(base);
    const value = Number(discountValue);
    let price: number;

    if (discountType === DiscountType.PERCENTAGE) {
      price = baseNum - (baseNum * value) / 100;
    } else {
      price = baseNum - value;
    }

    return this.roundMoney(Math.max(0, price));
  }

  calculateUnitPrice(input: CalculateUnitPriceInput): UnitPriceResult {
    const { product, variant, offers = [] } = input;
    const regularPrice = this.roundMoney(
      variant
        ? this.toNumber(variant.price)
        : this.toNumber(product.regularPrice),
    );

    const nowRelevant = offers;
    const productOffers = nowRelevant.filter(
      (o) =>
        o.scope === OfferScope.PRODUCT &&
        (o.productIds?.includes(product.id) ?? false),
    );
    const categoryOffers = nowRelevant.filter(
      (o) =>
        o.scope === OfferScope.CATEGORY && o.categoryId === product.categoryId,
    );

    const bestProduct = this.pickBestOffer(regularPrice, productOffers);
    if (bestProduct) {
      return bestProduct;
    }

    const bestCategory = this.pickBestOffer(regularPrice, categoryOffers);
    if (bestCategory) {
      return bestCategory;
    }

    const variantSale = variant?.salePrice
      ? this.toNumber(variant.salePrice)
      : null;
    if (variantSale !== null) {
      const unitPrice = this.roundMoney(Math.max(0, variantSale));
      return {
        unitPrice,
        regularPrice,
        discountAmount: this.roundMoney(Math.max(0, regularPrice - unitPrice)),
      };
    }

    const productSale = product.salePrice
      ? this.toNumber(product.salePrice)
      : null;
    if (productSale !== null) {
      const unitPrice = this.roundMoney(Math.max(0, productSale));
      return {
        unitPrice,
        regularPrice,
        discountAmount: this.roundMoney(Math.max(0, regularPrice - unitPrice)),
      };
    }

    if (variant) {
      return {
        unitPrice: regularPrice,
        regularPrice,
        discountAmount: 0,
      };
    }

    return {
      unitPrice: regularPrice,
      regularPrice,
      discountAmount: 0,
    };
  }

  private pickBestOffer(
    regularPrice: number,
    offers: PricingOfferInput[],
  ): UnitPriceResult | null {
    if (offers.length === 0) {
      return null;
    }

    let best: UnitPriceResult | null = null;

    for (const offer of offers) {
      const unitPrice = this.calculateOfferPrice(
        regularPrice,
        offer.discountType,
        this.toNumber(offer.discountValue),
      );
      const discountAmount = this.roundMoney(
        Math.max(0, regularPrice - unitPrice),
      );
      const candidate: UnitPriceResult = {
        unitPrice,
        regularPrice,
        discountAmount,
        appliedOfferId: offer.id,
      };

      if (!best || candidate.unitPrice < best.unitPrice) {
        best = candidate;
      }
    }

    return best;
  }

  private toNumber(value: Decimal | number | string): number {
    return Number(value);
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
