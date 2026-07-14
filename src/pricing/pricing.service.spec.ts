import { DiscountType, OfferScope } from '@prisma/client';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const pricing = new PricingService();

  const product = {
    id: 'p1',
    categoryId: 'c1',
    regularPrice: 100 as unknown as never,
    salePrice: 90 as unknown as never,
  };

  it('applies product offer before category offer and sale price', () => {
    const result = pricing.calculateUnitPrice({
      product,
      offers: [
        {
          id: 'o-cat',
          scope: OfferScope.CATEGORY,
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20,
          categoryId: 'c1',
        },
        {
          id: 'o-prod',
          scope: OfferScope.PRODUCT,
          discountType: DiscountType.FIXED,
          discountValue: 40,
          productIds: ['p1'],
        },
      ],
    });

    expect(result.unitPrice).toBe(60);
    expect(result.appliedOfferId).toBe('o-prod');
  });

  it('uses variant sale price when no offers', () => {
    const result = pricing.calculateUnitPrice({
      product: {
        ...product,
        salePrice: null as unknown as never,
        regularPrice: 50 as unknown as never,
      },
      variant: {
        id: 'v1',
        price: 55 as unknown as never,
        salePrice: 45 as unknown as never,
      },
      offers: [],
    });

    expect(result.unitPrice).toBe(45);
    expect(result.regularPrice).toBe(55);
  });

  it('falls back to product regular price', () => {
    const result = pricing.calculateUnitPrice({
      product: {
        id: 'p2',
        categoryId: 'c1',
        regularPrice: 12.5 as unknown as never,
        salePrice: null as unknown as never,
      },
      offers: [],
    });

    expect(result.unitPrice).toBe(12.5);
    expect(result.discountAmount).toBe(0);
  });
});
