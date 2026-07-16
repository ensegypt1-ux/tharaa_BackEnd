import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import {
  ListRecentSearchesDto,
  PopularSearchesQueryDto,
  SearchSuggestionsQueryDto,
} from './dto/search.dto';

const MAX_TERM_LENGTH = 100;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /** Normalize for uniqueness: trim, collapse whitespace, lowercase. */
  normalizeTerm(raw: string): { term: string; termKey: string } | null {
    const term = raw.trim().replace(/\s+/g, ' ');
    if (!term || term.length > MAX_TERM_LENGTH) {
      return null;
    }
    const termKey = term.toLocaleLowerCase('ar');
    if (!termKey) {
      return null;
    }
    return { term, termKey };
  }

  async suggestions(query: SearchSuggestionsQueryDto) {
    const q = query.q.trim();
    const limit = query.limit ?? 8;
    if (!q) {
      return [];
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: true,
      OR: [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ],
    };

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        categoryId: true,
        regularPrice: true,
        salePrice: true,
        images: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { path: true },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return products.map((p) => ({
      id: p.id,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      categoryId: p.categoryId,
      regularPrice: Number(p.regularPrice),
      salePrice:
        p.salePrice !== null && p.salePrice !== undefined
          ? Number(p.salePrice)
          : null,
      imageUrl: p.images[0]
        ? this.storage.getPublicUrl(p.images[0].path)
        : null,
    }));
  }

  async popular(query: PopularSearchesQueryDto) {
    const limit = query.limit ?? 10;
    const rows = await this.prisma.popularSearch.findMany({
      orderBy: [{ count: 'desc' }, { lastSearchedAt: 'desc' }],
      take: limit,
      select: {
        term: true,
        count: true,
        lastSearchedAt: true,
      },
    });

    return rows.map((r) => ({
      term: r.term,
      count: r.count,
      lastSearchedAt: r.lastSearchedAt,
    }));
  }

  async record(termRaw: string, userId?: string | null) {
    const normalized = this.normalizeTerm(termRaw);
    if (!normalized) {
      return { recorded: false };
    }

    const now = new Date();

    await this.prisma.popularSearch.upsert({
      where: { termKey: normalized.termKey },
      create: {
        term: normalized.term,
        termKey: normalized.termKey,
        count: 1,
        lastSearchedAt: now,
      },
      update: {
        term: normalized.term,
        count: { increment: 1 },
        lastSearchedAt: now,
      },
    });

    if (userId) {
      await this.prisma.userSearchHistory.upsert({
        where: {
          userId_termKey: {
            userId,
            termKey: normalized.termKey,
          },
        },
        create: {
          userId,
          term: normalized.term,
          termKey: normalized.termKey,
          searchedAt: now,
        },
        update: {
          term: normalized.term,
          searchedAt: now,
        },
      });
    }

    return {
      recorded: true,
      term: normalized.term,
    };
  }

  async listRecent(userId: string, query: ListRecentSearchesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserSearchHistoryWhereInput = { userId };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.userSearchHistory.count({ where }),
      this.prisma.userSearchHistory.findMany({
        where,
        orderBy: { searchedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          term: true,
          searchedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async clearRecent(userId: string) {
    const result = await this.prisma.userSearchHistory.deleteMany({
      where: { userId },
    });
    return { message: 'Recent searches cleared', deleted: result.count };
  }

  async deleteRecent(userId: string, id: string) {
    const existing = await this.prisma.userSearchHistory.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Recent search not found');
    }
    await this.prisma.userSearchHistory.delete({ where: { id } });
    return { message: 'Recent search deleted' };
  }
}
