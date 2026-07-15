import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Campaign, CampaignDestinationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const DESTINATION_REQUIRES_ID: CampaignDestinationType[] = [
  CampaignDestinationType.OFFER,
  CampaignDestinationType.CATEGORY,
  CampaignDestinationType.PRODUCT,
  CampaignDestinationType.COUPON,
];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async listPublicActive() {
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return campaigns.map((c) => this.toPublic(c));
  }

  async adminList() {
    const campaigns = await this.prisma.campaign.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return campaigns.map((c) => this.toAdmin(c));
  }

  async adminFindById(id: string) {
    const campaign = await this.findExistingOrThrow(id);
    return this.toAdmin(campaign);
  }

  async create(dto: CreateCampaignDto) {
    this.validateDateRange(dto.startsAt, dto.endsAt);
    const destination = this.normalizeDestination(
      dto.destinationType,
      dto.destinationId,
    );
    await this.assertDestinationExists(
      destination.destinationType,
      destination.destinationId,
    );

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
        destinationType: destination.destinationType,
        destinationId: destination.destinationId,
        buttonLabelAr: this.optionalTrim(dto.buttonLabelAr),
        buttonLabelEn: this.optionalTrim(dto.buttonLabelEn),
      },
    });

    return this.toAdmin(campaign);
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const existing = await this.findExistingOrThrow(id);

    const startsAt = dto.startsAt ?? existing.startsAt.toISOString();
    const endsAt = dto.endsAt ?? existing.endsAt.toISOString();
    this.validateDateRange(startsAt, endsAt);

    const destinationType = dto.destinationType ?? existing.destinationType;
    const destinationId =
      dto.destinationId !== undefined
        ? dto.destinationId
        : (existing.destinationId ?? undefined);
    const destination = this.normalizeDestination(
      destinationType,
      destinationId,
    );
    await this.assertDestinationExists(
      destination.destinationType,
      destination.destinationId,
    );

    const campaign = await this.prisma.campaign.update({
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
        ...(dto.buttonLabelAr !== undefined
          ? { buttonLabelAr: this.optionalTrim(dto.buttonLabelAr) }
          : {}),
        ...(dto.buttonLabelEn !== undefined
          ? { buttonLabelEn: this.optionalTrim(dto.buttonLabelEn) }
          : {}),
        ...(dto.destinationType !== undefined ||
        dto.destinationId !== undefined
          ? {
              destinationType: destination.destinationType,
              destinationId: destination.destinationId,
            }
          : {}),
      },
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
    });
    return this.toAdmin(updated);
  }

  private async findExistingOrThrow(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private normalizeDestination(
    destinationType: CampaignDestinationType,
    destinationId?: string | null,
  ): {
    destinationType: CampaignDestinationType;
    destinationId: string | null;
  } {
    if (
      destinationType === CampaignDestinationType.CART ||
      destinationType === CampaignDestinationType.NONE
    ) {
      return { destinationType, destinationId: null };
    }

    if (!destinationId) {
      throw new BadRequestException(
        `destinationId is required for ${destinationType} destination`,
      );
    }

    return { destinationType, destinationId };
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
        if (!offer) {
          throw new NotFoundException('Offer not found');
        }
        break;
      }
      case CampaignDestinationType.CATEGORY: {
        const category = await this.prisma.category.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!category) {
          throw new NotFoundException('Category not found');
        }
        break;
      }
      case CampaignDestinationType.PRODUCT: {
        const product = await this.prisma.product.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!product) {
          throw new NotFoundException('Product not found');
        }
        break;
      }
      case CampaignDestinationType.COUPON: {
        const coupon = await this.prisma.coupon.findFirst({
          where: { id: destinationId, deletedAt: null },
        });
        if (!coupon) {
          throw new NotFoundException('Coupon not found');
        }
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

  private optionalTrim(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toPublic(campaign: Campaign) {
    return {
      id: campaign.id,
      titleAr: campaign.titleAr,
      titleEn: campaign.titleEn,
      subtitleAr: campaign.subtitleAr,
      subtitleEn: campaign.subtitleEn,
      imageUrl: campaign.imagePath
        ? this.storage.getPublicUrl(campaign.imagePath)
        : null,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      sortOrder: campaign.sortOrder,
      destinationType: campaign.destinationType,
      destinationId: campaign.destinationId,
      buttonLabelAr: campaign.buttonLabelAr,
      buttonLabelEn: campaign.buttonLabelEn,
    };
  }

  private toAdmin(campaign: Campaign) {
    return {
      ...this.toPublic(campaign),
      isActive: campaign.isActive,
      imagePath: campaign.imagePath,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
