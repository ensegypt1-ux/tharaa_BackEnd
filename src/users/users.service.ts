import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, Locale, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { DeviceTokenDto } from './dto/device-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  role: UserRole;
  status: AccountStatus;
  locale: Locale;
  avatarUrl: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.findActiveUserOrThrow(userId);
    return this.toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    await this.findActiveUserOrThrow(userId);

    const email =
      dto.email !== undefined ? dto.email.trim().toLowerCase() : undefined;
    const phone = dto.phone !== undefined ? dto.phone.trim() : undefined;

    if (email || phone) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          deletedAt: null,
          id: { not: userId },
          OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
        },
      });

      if (conflict) {
        throw new ConflictException(
          email && conflict.email === email
            ? 'Email already in use'
            : 'Phone already in use',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined
          ? { fullName: dto.fullName.trim() }
          : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
      },
    });

    return this.toPublicUser(user);
  }

  async registerDeviceToken(userId: string, dto: DeviceTokenDto) {
    await this.findActiveUserOrThrow(userId);

    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        locale: dto.locale,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: dto.platform,
        locale: dto.locale,
        deletedAt: null,
        lastSeenAt: new Date(),
      },
    });
  }

  async removeDeviceToken(
    userId: string,
    token: string,
  ): Promise<{ message: string }> {
    const device = await this.prisma.deviceToken.findFirst({
      where: { token, userId, deletedAt: null },
    });

    if (!device) {
      throw new NotFoundException('Device token not found');
    }

    await this.prisma.deviceToken.update({
      where: { id: device.id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Device token removed' };
  }

  async setAvatar(userId: string, relativePath: string): Promise<PublicUser> {
    const user = await this.findActiveUserOrThrow(userId);

    if (user.avatarPath && user.avatarPath !== relativePath) {
      try {
        await this.storage.delete(user.avatarPath);
      } catch {
        // best-effort cleanup of previous avatar
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarPath: relativePath },
    });

    return this.toPublicUser(updated);
  }

  async adminUpdateStatus(
    userId: string,
    status: AccountStatus,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    return this.toPublicUser(updated);
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      locale: user.locale,
      avatarUrl: user.avatarPath
        ? this.storage.getPublicUrl(user.avatarPath)
        : null,
    };
  }

  private async findActiveUserOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
