import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

const ALLOWED_CITY = 'Al Khafji';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { id, deletedAt: null },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const city = this.normalizeCity(dto.city);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({
        where: { userId, deletedAt: null },
      });
      const makeDefault = dto.isDefault === true || count === 0;

      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: dto.label.trim(),
          recipientName: dto.recipientName.trim(),
          phone: dto.phone.trim(),
          city,
          district: dto.district.trim(),
          street: dto.street.trim(),
          building: dto.building?.trim(),
          floor: dto.floor?.trim(),
          apartment: dto.apartment?.trim(),
          directions: dto.directions?.trim(),
          formattedAddress: dto.formattedAddress?.trim(),
          googlePlaceId: dto.googlePlaceId?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault: makeDefault,
        },
      });
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    await this.findOne(userId, id);

    const city =
      dto.city !== undefined ? this.normalizeCity(dto.city) : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false },
        });
      }

      const data: Prisma.AddressUpdateInput = {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.recipientName !== undefined
          ? { recipientName: dto.recipientName.trim() }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(dto.district !== undefined
          ? { district: dto.district.trim() }
          : {}),
        ...(dto.street !== undefined ? { street: dto.street.trim() } : {}),
        ...(dto.building !== undefined
          ? { building: dto.building?.trim() ?? null }
          : {}),
        ...(dto.floor !== undefined
          ? { floor: dto.floor?.trim() ?? null }
          : {}),
        ...(dto.apartment !== undefined
          ? { apartment: dto.apartment?.trim() ?? null }
          : {}),
        ...(dto.directions !== undefined
          ? { directions: dto.directions?.trim() ?? null }
          : {}),
        ...(dto.formattedAddress !== undefined
          ? { formattedAddress: dto.formattedAddress?.trim() ?? null }
          : {}),
        ...(dto.googlePlaceId !== undefined
          ? { googlePlaceId: dto.googlePlaceId?.trim() ?? null }
          : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      };

      return tx.address.update({ where: { id }, data });
    });
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    const address = await this.findOne(userId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });

      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { message: 'Address deleted' };
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.findOne(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, deletedAt: null, isDefault: true },
        data: { isDefault: false },
      });

      return tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  private normalizeCity(city?: string): string {
    const value = (city ?? ALLOWED_CITY).trim();
    if (value.toLowerCase() !== ALLOWED_CITY.toLowerCase()) {
      throw new BadRequestException(
        `Only ${ALLOWED_CITY} is supported as delivery city`,
      );
    }
    return ALLOWED_CITY;
  }
}
