import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsService } from '../products/products.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListWishlistDto } from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async list(userId: string, query: ListWishlistDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WishlistItemWhereInput = {
      userId,
      product: {
        deletedAt: null,
        isActive: true,
      },
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.wishlistItem.count({ where }),
      this.prisma.wishlistItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          productId: true,
          createdAt: true,
        },
      }),
    ]);

    const productIds = items.map((i) => i.productId);
    const products = await this.productsService.findPublicByIds(
      productIds,
      userId,
    );
    const byId = new Map(
      products
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => [p.id as string, p]),
    );

    return {
      data: items
        .map((item) => {
          const product = byId.get(item.productId);
          if (!product) return null;
          return {
            id: item.id,
            productId: item.productId,
            createdAt: item.createdAt,
            product: {
              ...product,
              isFavorited: true,
            },
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });
    if (existing) {
      throw new ConflictException('Product already in wishlist');
    }

    const item = await this.prisma.wishlistItem.create({
      data: { userId, productId },
    });

    return {
      id: item.id,
      productId: item.productId,
      createdAt: item.createdAt,
      isFavorited: true,
    };
  }

  async remove(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.prisma.wishlistItem.delete({
      where: { id: existing.id },
    });

    return {
      message: 'Removed from wishlist',
      productId,
      isFavorited: false,
    };
  }
}
