import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { Inject } from '@nestjs/common';
import {
  ListMissingImagesDto,
  SearchProductImagesDto,
  SelectProductImageDto,
} from './dto/product-images.dto';

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
export class AdminProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async search(dto: SearchProductImagesDto) {
    const apiKey = this.config.get<string>('pexels.apiKey') || '';
    if (!apiKey) {
      throw new ServiceUnavailableException({
        message: 'Pexels API key is not configured',
        errorCode: 'PEXELS_MISSING_API_KEY',
      });
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      include: { category: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const query =
      dto.query?.trim() ||
      this.buildQuery(
        product.nameEn,
        product.nameAr,
        product.category?.nameEn,
        product.category?.nameAr,
      );

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
      productId: product.id,
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

  async selectAndStore(dto: SelectProductImageDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      include: {
        images: { where: { deletedAt: null } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let buffer: Buffer;
    let mimeType = 'image/jpeg';
    try {
      const res = await fetch(dto.imageUrl);
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

    const saved = await this.storage.save(buffer, 'products', mimeType);
    const makePrimary = product.images.length === 0;
    const attribution = [
      dto.photographer ? `Photo by ${dto.photographer}` : null,
      dto.photographerUrl || null,
      'via Pexels',
    ]
      .filter(Boolean)
      .join(' · ');

    const image = await this.prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.productImage.updateMany({
          where: { productId: product.id, deletedAt: null },
          data: { isPrimary: false },
        });
      }

      const created = await tx.productImage.create({
        data: {
          productId: product.id,
          path: saved.path,
          sortOrder: product.images.length,
          isPrimary: makePrimary,
          sourceUrl: dto.sourceUrl || dto.imageUrl,
          photographer: dto.photographer || null,
          attribution: attribution || null,
          sourceProvider: dto.sourceProvider || 'pexels',
        },
      });

      await tx.product.update({
        where: { id: product.id },
        data: { adminImageReviewedAt: new Date() },
      });

      return created;
    });

    return {
      id: image.id,
      path: image.path,
      url: this.storage.getPublicUrl(image.path),
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
      sourceUrl: image.sourceUrl,
      photographer: image.photographer,
      attribution: image.attribution,
      sourceProvider: image.sourceProvider,
    };
  }

  async listMissing(dto: ListMissingImagesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      images: { none: { deletedAt: null } },
      ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      ...(dto.includeReviewed ? {} : { adminImageReviewedAt: null }),
    };

    if (dto.q?.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          category: { select: { id: true, nameAr: true, nameEn: true } },
        },
      }),
    ]);

    return {
      data: products.map((p) => ({
        id: p.id,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        sku: p.sku,
        category: p.category,
        isActive: p.isActive,
        adminImageReviewedAt: p.adminImageReviewedAt,
        updatedAt: p.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async markReviewed(productId: string, skipped = true) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { adminImageReviewedAt: skipped ? new Date() : null },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        adminImageReviewedAt: true,
      },
    });

    return updated;
  }

  private buildQuery(
    nameEn?: string | null,
    nameAr?: string | null,
    categoryEn?: string | null,
    categoryAr?: string | null,
  ) {
    const name =
      (nameEn && nameEn.trim()) ||
      this.normalizeArabicName(nameAr) ||
      'grocery product';
    const category =
      (categoryEn && categoryEn.trim()) ||
      this.normalizeArabicName(categoryAr) ||
      'food grocery';
    return `${name} ${category} food product`.replace(/\s+/g, ' ').trim();
  }

  private normalizeArabicName(value?: string | null): string | null {
    if (!value?.trim()) {
      return null;
    }
    // Lightweight transliteration-ish fallback: strip diacritics and keep Latin if present.
    const cleaned = value
      .normalize('NFKD')
      .replace(/[\u064B-\u065F]/g, '')
      .trim();
    const latin = cleaned.replace(/[^\u0000-\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (latin.length >= 2) {
      return latin;
    }
    // Common grocery keyword fallback when Arabic-only
    return `${cleaned} grocery food`.slice(0, 80);
  }
}
