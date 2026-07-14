import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Coupon,
  CouponApplicability,
  DiscountType,
  FulfilmentType,
  Prisma,
} from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

export type ValidatedCoupon = {
  coupon: Coupon;
  discountAmount: number;
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<Coupon | null> {
    return this.prisma.coupon.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        deletedAt: null,
      },
    });
  }

  async validateCoupon(
    code: string,
    userId: string,
    subtotal: number,
    fulfilmentType?: FulfilmentType,
  ): Promise<ValidatedCoupon> {
    const coupon = await this.findByCode(code);

    if (!coupon) {
      throw new BadRequestException('Invalid coupon code');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is inactive');
    }

    const now = new Date();
    if (now < coupon.startsAt) {
      throw new BadRequestException('Coupon is not active yet');
    }
    if (now > coupon.expiresAt) {
      throw new BadRequestException('Coupon has expired');
    }

    if (
      coupon.minOrderAmount != null &&
      subtotal < Number(coupon.minOrderAmount)
    ) {
      throw new BadRequestException(
        `Minimum order amount is ${Number(coupon.minOrderAmount)}`,
      );
    }

    this.assertApplicability(coupon.applicability, fulfilmentType);

    if (coupon.usageLimit != null) {
      const totalUsages = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id },
      });
      if (totalUsages >= coupon.usageLimit) {
        throw new BadRequestException('Coupon usage limit reached');
      }
    }

    if (coupon.perUserLimit != null) {
      const userUsages = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUsages >= coupon.perUserLimit) {
        throw new BadRequestException(
          'You have reached the usage limit for this coupon',
        );
      }
    }

    const discountAmount = this.calculateDiscount(coupon, subtotal);
    if (discountAmount <= 0) {
      throw new BadRequestException('Coupon does not apply to this order');
    }

    return { coupon, discountAmount };
  }

  calculateDiscount(coupon: Coupon, subtotal: number): number {
    let discount = 0;

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (subtotal * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscountAmount != null) {
        discount = Math.min(discount, Number(coupon.maxDiscountAmount));
      }
    } else {
      discount = Number(coupon.discountValue);
    }

    discount = Math.min(discount, subtotal);
    return Number(Math.max(0, discount).toFixed(2));
  }

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('Coupon code already exists');
    }

    if (new Date(dto.expiresAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }

    if (existing?.deletedAt) {
      return this.prisma.coupon.update({
        where: { id: existing.id },
        data: {
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          minOrderAmount: dto.minOrderAmount,
          maxDiscountAmount: dto.maxDiscountAmount,
          usageLimit: dto.usageLimit,
          perUserLimit: dto.perUserLimit,
          startsAt: new Date(dto.startsAt),
          expiresAt: new Date(dto.expiresAt),
          applicability: dto.applicability ?? CouponApplicability.ALL,
          isActive: true,
          deletedAt: null,
        },
      });
    }

    return this.prisma.coupon.create({
      data: {
        code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount,
        usageLimit: dto.usageLimit,
        perUserLimit: dto.perUserLimit,
        startsAt: new Date(dto.startsAt),
        expiresAt: new Date(dto.expiresAt),
        applicability: dto.applicability ?? CouponApplicability.ALL,
      },
    });
  }

  async findAll(query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { usages: true } },
        },
      }),
      this.prisma.coupon.count({ where: { deletedAt: null } }),
    ]);

    return {
      items: items.map(({ _count, ...coupon }) => ({
        ...coupon,
        usageCount: _count.usages,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { usages: true } },
      },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    const { _count, ...rest } = coupon;
    return {
      ...rest,
      usageCount: _count.usages,
    };
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);

    if (dto.startsAt && dto.expiresAt) {
      if (new Date(dto.expiresAt) <= new Date(dto.startsAt)) {
        throw new BadRequestException('expiresAt must be after startsAt');
      }
    }

    const data: Prisma.CouponUpdateInput = {
      ...(dto.discountType !== undefined
        ? { discountType: dto.discountType }
        : {}),
      ...(dto.discountValue !== undefined
        ? { discountValue: dto.discountValue }
        : {}),
      ...(dto.minOrderAmount !== undefined
        ? { minOrderAmount: dto.minOrderAmount }
        : {}),
      ...(dto.maxDiscountAmount !== undefined
        ? { maxDiscountAmount: dto.maxDiscountAmount }
        : {}),
      ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
      ...(dto.perUserLimit !== undefined
        ? { perUserLimit: dto.perUserLimit }
        : {}),
      ...(dto.startsAt !== undefined
        ? { startsAt: new Date(dto.startsAt) }
        : {}),
      ...(dto.expiresAt !== undefined
        ? { expiresAt: new Date(dto.expiresAt) }
        : {}),
      ...(dto.applicability !== undefined
        ? { applicability: dto.applicability }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    await this.prisma.coupon.update({ where: { id }, data });
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Coupon deleted' };
  }

  private assertApplicability(
    applicability: CouponApplicability,
    fulfilmentType?: FulfilmentType,
  ) {
    if (applicability === CouponApplicability.ALL) {
      return;
    }

    if (!fulfilmentType) {
      throw new BadRequestException(
        'Fulfilment type is required for this coupon',
      );
    }

    if (
      applicability === CouponApplicability.DELIVERY_ONLY &&
      fulfilmentType !== FulfilmentType.DELIVERY
    ) {
      throw new BadRequestException('Coupon is valid for delivery only');
    }

    if (
      applicability === CouponApplicability.PICKUP_ONLY &&
      fulfilmentType !== FulfilmentType.PICKUP
    ) {
      throw new BadRequestException('Coupon is valid for pickup only');
    }
  }
}
