import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Campaign,
  CampaignAudience,
  CampaignDestinationType,
  CampaignEventType,
  CampaignFrequency,
  CampaignLayout,
  CampaignPlacement,
  CampaignPlacementAssignment,
  CampaignRotationMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import {
  BulkTrackCampaignEventsDto,
  ListPublicCampaignsDto,
  TrackCampaignEventDto,
} from './dto/list-public-campaigns.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const DESTINATION_REQUIRES_ID: CampaignDestinationType[] = [
  CampaignDestinationType.OFFER,
  CampaignDestinationType.CATEGORY,
  CampaignDestinationType.PRODUCT,
  CampaignDestinationType.COUPON,
];

const DEFAULT_PLACEMENTS: CampaignPlacement[] = [
  CampaignPlacement.HOME_SLIDER,
];

type CampaignWithPlacements = Campaign & {
  placements: CampaignPlacementAssignment[];
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /** Compatible flat list + optional placement / targeting filters. */
  async listPublicActive(query: ListPublicCampaignsDto = {}) {
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        ...(query.placement
          ? { placements: { some: { placement: query.placement } } }
          : {}),
      },
      include: { placements: true },
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const filtered = campaigns.filter((c) =>
      this.matchesTargeting(c, query),
    );
    const rotated = this.applyRotation(filtered, query.limit);
    return rotated.map((c) => this.toPublic(c));
  }

  async listByPlacement(
    placement: CampaignPlacement,
    query: ListPublicCampaignsDto = {},
  ) {
    return this.listPublicActive({ ...query, placement });
  }

  async adminList() {
    const campaigns = await this.prisma.campaign.findMany({
      where: { deletedAt: null },
      include: { placements: true },
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return campaigns.map((c) => this.toAdmin(c));
  }

  async adminFindById(id: string) {
    const campaign = await this.findExistingOrThrow(id);
    return this.toAdmin(campaign);
  }

  async adminAnalyticsSummary() {
    const campaigns = await this.prisma.campaign.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        titleAr: true,
        titleEn: true,
        isActive: true,
        impressionCount: true,
        clickCount: true,
        lastViewedAt: true,
        lastClickedAt: true,
        startsAt: true,
        endsAt: true,
        placements: { select: { placement: true } },
      },
      orderBy: [{ impressionCount: 'desc' }, { clickCount: 'desc' }],
    });

    const totals = campaigns.reduce(
      (acc, c) => {
        acc.impressions += c.impressionCount;
        acc.clicks += c.clickCount;
        return acc;
      },
      { impressions: 0, clicks: 0 },
    );

    return {
      totals: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr:
          totals.impressions > 0
            ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2))
            : 0,
        campaigns: campaigns.length,
      },
      items: campaigns.map((c) => ({
        id: c.id,
        titleAr: c.titleAr,
        titleEn: c.titleEn,
        isActive: c.isActive,
        placements: c.placements.map((p) => p.placement),
        impressionCount: c.impressionCount,
        clickCount: c.clickCount,
        ctr:
          c.impressionCount > 0
            ? Number(((c.clickCount / c.impressionCount) * 100).toFixed(2))
            : 0,
        lastViewedAt: c.lastViewedAt,
        lastClickedAt: c.lastClickedAt,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
      })),
    };
  }

  async create(dto: CreateCampaignDto) {
    this.validateDateRange(dto.startsAt, dto.endsAt);
    this.validateFrequency(dto.frequency, dto.dismissHours);
    this.validateCartRange(dto.minCartAmount, dto.maxCartAmount);
    const destination = this.normalizeDestination(dto);
    await this.assertDestinationExists(
      destination.destinationType,
      destination.destinationId,
    );

    const placements = this.normalizePlacements(dto.placements);

    const campaign = await this.prisma.campaign.create({
      data: {
        titleAr: dto.titleAr.trim(),
        titleEn: dto.titleEn.trim(),
        subtitleAr: this.optionalTrim(dto.subtitleAr),
        subtitleEn: this.optionalTrim(dto.subtitleEn),
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        priority: dto.priority ?? dto.sortOrder ?? 0,
        weight: dto.weight ?? 1,
        rotationMode: dto.rotationMode ?? CampaignRotationMode.PRIORITY,
        maxImpressions: dto.maxImpressions ?? null,
        maxClicks: dto.maxClicks ?? null,
        layout: dto.layout ?? CampaignLayout.HERO_BANNER,
        audience: dto.audience ?? CampaignAudience.ALL,
        frequency: dto.frequency ?? CampaignFrequency.ALWAYS,
        dismissHours: dto.dismissHours ?? null,
        targetCities: this.normalizeStringList(dto.targetCities),
        targetBranchIds: this.normalizeStringList(dto.targetBranchIds),
        targetCategoryIds: this.normalizeStringList(dto.targetCategoryIds),
        targetProductIds: this.normalizeStringList(dto.targetProductIds),
        targetOfferIds: this.normalizeStringList(dto.targetOfferIds),
        targetCouponIds: this.normalizeStringList(dto.targetCouponIds),
        minCartAmount:
          dto.minCartAmount !== undefined && dto.minCartAmount !== null
            ? dto.minCartAmount
            : null,
        maxCartAmount:
          dto.maxCartAmount !== undefined && dto.maxCartAmount !== null
            ? dto.maxCartAmount
            : null,
        backgroundColor: this.optionalTrim(dto.backgroundColor),
        gradientFrom: this.optionalTrim(dto.gradientFrom),
        gradientTo: this.optionalTrim(dto.gradientTo),
        badgeTextAr: this.optionalTrim(dto.badgeTextAr),
        badgeTextEn: this.optionalTrim(dto.badgeTextEn),
        discountBadgeAr: this.optionalTrim(dto.discountBadgeAr),
        discountBadgeEn: this.optionalTrim(dto.discountBadgeEn),
        ctaStyle: dto.ctaStyle,
        textAlign: dto.textAlign,
        overlayOpacity:
          dto.overlayOpacity !== undefined ? dto.overlayOpacity : 0.35,
        cornerRadius: dto.cornerRadius !== undefined ? dto.cornerRadius : 16,
        destinationType: destination.destinationType,
        destinationId: destination.destinationId,
        destinationUrl: destination.destinationUrl,
        destinationRoute: destination.destinationRoute,
        autoApplyCoupon: dto.autoApplyCoupon ?? false,
        buttonLabelAr: this.optionalTrim(dto.buttonLabelAr),
        buttonLabelEn: this.optionalTrim(dto.buttonLabelEn),
        placements: {
          create: placements.map((placement) => ({ placement })),
        },
      },
      include: { placements: true },
    });

    return this.toAdmin(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const existing = await this.findExistingOrThrow(id);

    const startsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const endsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.validateDateRange(startsAt, endsAt);

    const frequency = dto.frequency ?? existing.frequency;
    const dismissHours =
      dto.dismissHours !== undefined ? dto.dismissHours : existing.dismissHours;
    this.validateFrequency(frequency, dismissHours);

    const minCart =
      dto.minCartAmount !== undefined
        ? dto.minCartAmount
        : existing.minCartAmount != null
          ? Number(existing.minCartAmount)
          : null;
    const maxCart =
      dto.maxCartAmount !== undefined
        ? dto.maxCartAmount
        : existing.maxCartAmount != null
          ? Number(existing.maxCartAmount)
          : null;
    this.validateCartRange(minCart, maxCart);

    const destinationType = dto.destinationType ?? existing.destinationType;
    const destination = this.normalizeDestination({
      destinationType,
      destinationId:
        dto.destinationId !== undefined
          ? dto.destinationId
          : (existing.destinationId ?? undefined),
      destinationUrl:
        dto.destinationUrl !== undefined
          ? dto.destinationUrl
          : (existing.destinationUrl ?? undefined),
      destinationRoute:
        dto.destinationRoute !== undefined
          ? dto.destinationRoute
          : (existing.destinationRoute ?? undefined),
    });
    await this.assertDestinationExists(
      destination.destinationType,
      destination.destinationId,
    );

    const campaign = await this.prisma.$transaction(async (tx) => {
      if (dto.placements) {
        const placements = this.normalizePlacements(dto.placements);
        await tx.campaignPlacementAssignment.deleteMany({
          where: { campaignId: id },
        });
        await tx.campaignPlacementAssignment.createMany({
          data: placements.map((placement) => ({ campaignId: id, placement })),
        });
      }

      return tx.campaign.update({
        where: { id },
        data: {
          ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr.trim() } : {}),
          ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn.trim() } : {}),
          ...(dto.subtitleAr !== undefined
            ? { subtitleAr: this.optionalTrim(dto.subtitleAr) }
            : {}),
          ...(dto.subtitleEn !== undefined
            ? { subtitleEn: this.optionalTrim(dto.subtitleEn) }
            : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: new Date(dto.startsAt) }
            : {}),
          ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.rotationMode !== undefined
            ? { rotationMode: dto.rotationMode }
            : {}),
          ...(dto.maxImpressions !== undefined
            ? { maxImpressions: dto.maxImpressions }
            : {}),
          ...(dto.maxClicks !== undefined ? { maxClicks: dto.maxClicks } : {}),
          ...(dto.layout !== undefined ? { layout: dto.layout } : {}),
          ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
          ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
          ...(dto.dismissHours !== undefined
            ? { dismissHours: dto.dismissHours }
            : {}),
          ...(dto.targetCities !== undefined
            ? { targetCities: this.normalizeStringList(dto.targetCities) }
            : {}),
          ...(dto.targetBranchIds !== undefined
            ? { targetBranchIds: this.normalizeStringList(dto.targetBranchIds) }
            : {}),
          ...(dto.targetCategoryIds !== undefined
            ? {
                targetCategoryIds: this.normalizeStringList(
                  dto.targetCategoryIds,
                ),
              }
            : {}),
          ...(dto.targetProductIds !== undefined
            ? {
                targetProductIds: this.normalizeStringList(dto.targetProductIds),
              }
            : {}),
          ...(dto.targetOfferIds !== undefined
            ? { targetOfferIds: this.normalizeStringList(dto.targetOfferIds) }
            : {}),
          ...(dto.targetCouponIds !== undefined
            ? {
                targetCouponIds: this.normalizeStringList(dto.targetCouponIds),
              }
            : {}),
          ...(dto.minCartAmount !== undefined
            ? { minCartAmount: dto.minCartAmount }
            : {}),
          ...(dto.maxCartAmount !== undefined
            ? { maxCartAmount: dto.maxCartAmount }
            : {}),
          ...(dto.backgroundColor !== undefined
            ? { backgroundColor: this.optionalTrim(dto.backgroundColor) }
            : {}),
          ...(dto.gradientFrom !== undefined
            ? { gradientFrom: this.optionalTrim(dto.gradientFrom) }
            : {}),
          ...(dto.gradientTo !== undefined
            ? { gradientTo: this.optionalTrim(dto.gradientTo) }
            : {}),
          ...(dto.badgeTextAr !== undefined
            ? { badgeTextAr: this.optionalTrim(dto.badgeTextAr) }
            : {}),
          ...(dto.badgeTextEn !== undefined
            ? { badgeTextEn: this.optionalTrim(dto.badgeTextEn) }
            : {}),
          ...(dto.discountBadgeAr !== undefined
            ? { discountBadgeAr: this.optionalTrim(dto.discountBadgeAr) }
            : {}),
          ...(dto.discountBadgeEn !== undefined
            ? { discountBadgeEn: this.optionalTrim(dto.discountBadgeEn) }
            : {}),
          ...(dto.ctaStyle !== undefined ? { ctaStyle: dto.ctaStyle } : {}),
          ...(dto.textAlign !== undefined ? { textAlign: dto.textAlign } : {}),
          ...(dto.overlayOpacity !== undefined
            ? { overlayOpacity: dto.overlayOpacity }
            : {}),
          ...(dto.cornerRadius !== undefined
            ? { cornerRadius: dto.cornerRadius }
            : {}),
          ...(dto.buttonLabelAr !== undefined
            ? { buttonLabelAr: this.optionalTrim(dto.buttonLabelAr) }
            : {}),
          ...(dto.buttonLabelEn !== undefined
            ? { buttonLabelEn: this.optionalTrim(dto.buttonLabelEn) }
            : {}),
          ...(dto.autoApplyCoupon !== undefined
            ? { autoApplyCoupon: dto.autoApplyCoupon }
            : {}),
          ...(dto.destinationType !== undefined ||
          dto.destinationId !== undefined ||
          dto.destinationUrl !== undefined ||
          dto.destinationRoute !== undefined
            ? {
                destinationType: destination.destinationType,
                destinationId: destination.destinationId,
                destinationUrl: destination.destinationUrl,
                destinationRoute: destination.destinationRoute,
              }
            : {}),
        },
        include: { placements: true },
      });
    });

    return this.toAdmin(campaign);
  }

  async softDelete(id: string): Promise<{ message: string }> {
    await this.findExistingOrThrow(id);
    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { message: 'Campaign deleted' };
  }

  async setImage(id: string, relativePath: string) {
    const campaign = await this.findExistingOrThrow(id);
    if (campaign.imagePath && campaign.imagePath !== relativePath) {
      try {
        await this.storage.delete(campaign.imagePath);
      } catch {
        // best-effort cleanup
      }
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { imagePath: relativePath },
      include: { placements: true },
    });
    return this.toAdmin(updated);
  }

  async removeImage(id: string) {
    const campaign = await this.findExistingOrThrow(id);
    if (campaign.imagePath) {
      try {
        await this.storage.delete(campaign.imagePath);
      } catch {
        // best-effort cleanup
      }
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { imagePath: null },
      include: { placements: true },
    });
    return this.toAdmin(updated);
  }

  async setIcon(id: string, relativePath: string) {
    const campaign = await this.findExistingOrThrow(id);
    if (campaign.iconPath && campaign.iconPath !== relativePath) {
      try {
        await this.storage.delete(campaign.iconPath);
      } catch {
        // best-effort cleanup
      }
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { iconPath: relativePath },
      include: { placements: true },
    });
    return this.toAdmin(updated);
  }

  async removeIcon(id: string) {
    const campaign = await this.findExistingOrThrow(id);
    if (campaign.iconPath) {
      try {
        await this.storage.delete(campaign.iconPath);
      } catch {
        // best-effort cleanup
      }
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { iconPath: null },
      include: { placements: true },
    });
    return this.toAdmin(updated);
  }

  async trackEvent(
    id: string,
    dto: TrackCampaignEventDto,
    userId?: string | null,
  ) {
    const campaign = await this.findExistingOrThrow(id);
    const type =
      dto.type === 'CLICK'
        ? CampaignEventType.CLICK
        : CampaignEventType.IMPRESSION;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.campaignEvent.create({
        data: {
          campaignId: campaign.id,
          type,
          placement: dto.placement ?? null,
          userId: userId ?? null,
          sessionId: dto.sessionId?.trim() || null,
        },
      }),
      this.prisma.campaign.update({
        where: { id: campaign.id },
        data:
          type === CampaignEventType.CLICK
            ? {
                clickCount: { increment: 1 },
                lastClickedAt: now,
              }
            : {
                impressionCount: { increment: 1 },
                lastViewedAt: now,
              },
      }),
    ]);

    return { message: 'Tracked', type };
  }

  async trackBulk(dto: BulkTrackCampaignEventsDto, userId?: string | null) {
    const impressionIds = [...new Set(dto.impressionIds ?? [])];
    const clickIds = [...new Set(dto.clickIds ?? [])];
    if (!impressionIds.length && !clickIds.length) {
      throw new BadRequestException('impressionIds or clickIds required');
    }

    const now = new Date();
    const events: Prisma.CampaignEventCreateManyInput[] = [
      ...impressionIds.map((campaignId) => ({
        campaignId,
        type: CampaignEventType.IMPRESSION,
        placement: dto.placement ?? null,
        userId: userId ?? null,
        sessionId: dto.sessionId?.trim() || null,
      })),
      ...clickIds.map((campaignId) => ({
        campaignId,
        type: CampaignEventType.CLICK,
        placement: dto.placement ?? null,
        userId: userId ?? null,
        sessionId: dto.sessionId?.trim() || null,
      })),
    ];

    await this.prisma.$transaction(async (tx) => {
      if (events.length) {
        await tx.campaignEvent.createMany({ data: events });
      }
      for (const campaignId of impressionIds) {
        await tx.campaign.updateMany({
          where: { id: campaignId, deletedAt: null },
          data: {
            impressionCount: { increment: 1 },
            lastViewedAt: now,
          },
        });
      }
      for (const campaignId of clickIds) {
        await tx.campaign.updateMany({
          where: { id: campaignId, deletedAt: null },
          data: {
            clickCount: { increment: 1 },
            lastClickedAt: now,
          },
        });
      }
    });

    return {
      message: 'Tracked',
      impressions: impressionIds.length,
      clicks: clickIds.length,
    };
  }

  private matchesTargeting(
    campaign: Campaign,
    query: ListPublicCampaignsDto,
  ): boolean {
    if (
      campaign.maxImpressions != null &&
      campaign.impressionCount >= campaign.maxImpressions
    ) {
      return false;
    }
    if (
      campaign.maxClicks != null &&
      campaign.clickCount >= campaign.maxClicks
    ) {
      return false;
    }

    if (campaign.audience === CampaignAudience.GUEST_ONLY) {
      if (query.authenticated === true) return false;
    }
    if (campaign.audience === CampaignAudience.LOGGED_IN_ONLY) {
      if (query.authenticated !== true) return false;
    }

    if (
      campaign.targetCities.length &&
      (!query.city ||
        !campaign.targetCities.some(
          (c) => c.toLowerCase() === query.city!.trim().toLowerCase(),
        ))
    ) {
      return false;
    }

    if (
      campaign.targetBranchIds.length &&
      (!query.branchId || !campaign.targetBranchIds.includes(query.branchId))
    ) {
      return false;
    }

    if (
      campaign.targetCategoryIds.length &&
      (!query.categoryId ||
        !campaign.targetCategoryIds.includes(query.categoryId))
    ) {
      return false;
    }

    if (
      campaign.targetProductIds.length &&
      (!query.productId || !campaign.targetProductIds.includes(query.productId))
    ) {
      return false;
    }

    if (
      campaign.targetOfferIds.length &&
      (!query.offerId || !campaign.targetOfferIds.includes(query.offerId))
    ) {
      return false;
    }

    if (
      campaign.targetCouponIds.length &&
      (!query.couponId || !campaign.targetCouponIds.includes(query.couponId))
    ) {
      return false;
    }

    if (campaign.minCartAmount != null && query.cartAmount !== undefined) {
      if (query.cartAmount < Number(campaign.minCartAmount)) return false;
    }
    if (campaign.maxCartAmount != null && query.cartAmount !== undefined) {
      if (query.cartAmount > Number(campaign.maxCartAmount)) return false;
    }
    // If amount targeting set but client didn't send cartAmount, exclude
    if (
      (campaign.minCartAmount != null || campaign.maxCartAmount != null) &&
      query.cartAmount === undefined
    ) {
      return false;
    }

    return true;
  }

  private applyRotation(
    campaigns: CampaignWithPlacements[],
    limit?: number,
  ): CampaignWithPlacements[] {
    if (!campaigns.length) return campaigns;

    const mode =
      campaigns.find((c) => c.rotationMode !== CampaignRotationMode.PRIORITY)
        ?.rotationMode ?? campaigns[0].rotationMode;

    let ordered = [...campaigns];
    if (mode === CampaignRotationMode.RANDOM) {
      ordered = this.shuffle(ordered);
    } else if (mode === CampaignRotationMode.WEIGHT) {
      ordered = this.weightedShuffle(ordered);
    } else {
      ordered.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    if (limit != null && limit > 0) {
      return ordered.slice(0, limit);
    }
    return ordered;
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private weightedShuffle(
    campaigns: CampaignWithPlacements[],
  ): CampaignWithPlacements[] {
    const pool = [...campaigns];
    const result: CampaignWithPlacements[] = [];
    while (pool.length) {
      const totalWeight = pool.reduce((sum, c) => sum + Math.max(1, c.weight), 0);
      let ticket = Math.random() * totalWeight;
      let idx = 0;
      for (let i = 0; i < pool.length; i += 1) {
        ticket -= Math.max(1, pool[i].weight);
        if (ticket <= 0) {
          idx = i;
          break;
        }
      }
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }

  private async findExistingOrThrow(
    id: string,
  ): Promise<CampaignWithPlacements> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
      include: { placements: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private normalizePlacements(
    placements?: CampaignPlacement[],
  ): CampaignPlacement[] {
    const list = [...new Set(placements?.length ? placements : DEFAULT_PLACEMENTS)];
    if (!list.length) {
      throw new BadRequestException('At least one placement is required');
    }
    return list;
  }

  private normalizeStringList(values?: string[] | null): string[] {
    if (!values?.length) return [];
    return [
      ...new Set(
        values
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      ),
    ];
  }

  private normalizeDestination(dto: {
    destinationType: CampaignDestinationType;
    destinationId?: string | null;
    destinationUrl?: string | null;
    destinationRoute?: string | null;
  }): {
    destinationType: CampaignDestinationType;
    destinationId: string | null;
    destinationUrl: string | null;
    destinationRoute: string | null;
  } {
    const type = dto.destinationType;

    if (
      type === CampaignDestinationType.CART ||
      type === CampaignDestinationType.NONE ||
      type === CampaignDestinationType.CHECKOUT ||
      type === CampaignDestinationType.ORDERS ||
      type === CampaignDestinationType.SEARCH
    ) {
      return {
        destinationType: type,
        destinationId: null,
        destinationUrl: null,
        destinationRoute: null,
      };
    }

    if (type === CampaignDestinationType.EXTERNAL_URL) {
      const url = dto.destinationUrl?.trim();
      if (!url) {
        throw new BadRequestException(
          'destinationUrl is required for EXTERNAL_URL',
        );
      }
      return {
        destinationType: type,
        destinationId: null,
        destinationUrl: url,
        destinationRoute: null,
      };
    }

    if (type === CampaignDestinationType.INTERNAL_ROUTE) {
      const route = dto.destinationRoute?.trim();
      if (!route) {
        throw new BadRequestException(
          'destinationRoute is required for INTERNAL_ROUTE',
        );
      }
      return {
        destinationType: type,
        destinationId: null,
        destinationUrl: null,
        destinationRoute: route.startsWith('/') ? route : `/${route}`,
      };
    }

    if (!dto.destinationId) {
      throw new BadRequestException(
        `destinationId is required for ${type} destination`,
      );
    }

    return {
      destinationType: type,
      destinationId: dto.destinationId,
      destinationUrl: null,
      destinationRoute: null,
    };
  }

  private async assertDestinationExists(
    destinationType: CampaignDestinationType,
    destinationId: string | null,
  ) {
    if (!DESTINATION_REQUIRES_ID.includes(destinationType) || !destinationId) {
      return;
    }

    switch (destinationType) {
      case CampaignDestinationType.OFFER: {
        const offer = await this.prisma.offer.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!offer) throw new NotFoundException('Offer not found');
        break;
      }
      case CampaignDestinationType.CATEGORY: {
        const category = await this.prisma.category.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!category) throw new NotFoundException('Category not found');
        break;
      }
      case CampaignDestinationType.PRODUCT: {
        const product = await this.prisma.product.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!product) throw new NotFoundException('Product not found');
        break;
      }
      case CampaignDestinationType.COUPON: {
        const coupon = await this.prisma.coupon.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!coupon) throw new NotFoundException('Coupon not found');
        break;
      }
      default:
        break;
    }
  }

  private validateDateRange(startsAt: string | Date, endsAt: string | Date) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(start < end)) {
      throw new BadRequestException('startsAt must be before endsAt');
    }
  }

  private validateFrequency(
    frequency?: CampaignFrequency | null,
    dismissHours?: number | null,
  ) {
    if (
      frequency === CampaignFrequency.DISMISS_HOURS &&
      (dismissHours == null || dismissHours < 1)
    ) {
      throw new BadRequestException(
        'dismissHours is required when frequency is DISMISS_HOURS',
      );
    }
  }

  private validateCartRange(
    minCartAmount?: number | null,
    maxCartAmount?: number | null,
  ) {
    if (
      minCartAmount != null &&
      maxCartAmount != null &&
      minCartAmount > maxCartAmount
    ) {
      throw new BadRequestException(
        'minCartAmount must be less than or equal to maxCartAmount',
      );
    }
  }

  private optionalTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toPublic(campaign: CampaignWithPlacements) {
    return {
      id: campaign.id,
      titleAr: campaign.titleAr,
      titleEn: campaign.titleEn,
      subtitleAr: campaign.subtitleAr,
      subtitleEn: campaign.subtitleEn,
      imageUrl: campaign.imagePath
        ? this.storage.getPublicUrl(campaign.imagePath)
        : null,
      iconUrl: campaign.iconPath
        ? this.storage.getPublicUrl(campaign.iconPath)
        : null,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      sortOrder: campaign.sortOrder,
      priority: campaign.priority,
      weight: campaign.weight,
      rotationMode: campaign.rotationMode,
      layout: campaign.layout,
      placements: campaign.placements.map((p) => p.placement),
      audience: campaign.audience,
      frequency: campaign.frequency,
      dismissHours: campaign.dismissHours,
      backgroundColor: campaign.backgroundColor,
      gradientFrom: campaign.gradientFrom,
      gradientTo: campaign.gradientTo,
      badgeTextAr: campaign.badgeTextAr,
      badgeTextEn: campaign.badgeTextEn,
      discountBadgeAr: campaign.discountBadgeAr,
      discountBadgeEn: campaign.discountBadgeEn,
      ctaStyle: campaign.ctaStyle,
      textAlign: campaign.textAlign,
      overlayOpacity: campaign.overlayOpacity,
      cornerRadius: campaign.cornerRadius,
      destinationType: campaign.destinationType,
      destinationId: campaign.destinationId,
      destinationUrl: campaign.destinationUrl,
      destinationRoute: campaign.destinationRoute,
      autoApplyCoupon: campaign.autoApplyCoupon,
      buttonLabelAr: campaign.buttonLabelAr,
      buttonLabelEn: campaign.buttonLabelEn,
      // Compat: older clients ignore unknown fields
    };
  }

  private toAdmin(campaign: CampaignWithPlacements) {
    const impressions = campaign.impressionCount;
    const clicks = campaign.clickCount;
    return {
      ...this.toPublic(campaign),
      isActive: campaign.isActive,
      imagePath: campaign.imagePath,
      iconPath: campaign.iconPath,
      maxImpressions: campaign.maxImpressions,
      maxClicks: campaign.maxClicks,
      targetCities: campaign.targetCities,
      targetBranchIds: campaign.targetBranchIds,
      targetCategoryIds: campaign.targetCategoryIds,
      targetProductIds: campaign.targetProductIds,
      targetOfferIds: campaign.targetOfferIds,
      targetCouponIds: campaign.targetCouponIds,
      minCartAmount:
        campaign.minCartAmount != null ? Number(campaign.minCartAmount) : null,
      maxCartAmount:
        campaign.maxCartAmount != null ? Number(campaign.maxCartAmount) : null,
      impressionCount: impressions,
      clickCount: clicks,
      ctr:
        impressions > 0
          ? Number(((clicks / impressions) * 100).toFixed(2))
          : 0,
      lastViewedAt: campaign.lastViewedAt,
      lastClickedAt: campaign.lastClickedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
