import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, Locale, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    const email = dto.email?.trim().toLowerCase() || undefined;
    const phone = dto.phone?.trim() || undefined;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });

    if (existing) {
      throw new ConflictException(
        email && existing.email === email
          ? 'Email already registered'
          : 'Phone already registered',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email: email ?? null,
        phone: phone ?? null,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: AccountStatus.ACTIVE,
        locale: Locale.ar,
      },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const identifier = dto.identifier.trim();
    const user = await this.findByIdentifier(identifier);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async google(dto: GoogleAuthDto): Promise<AuthTokensResponse> {
    const audiences = this.config.get<string[]>('googleClientIds') ?? [];
    if (!audiences.length) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    let googleSub: string;
    let email: string | undefined;
    let fullName: string | undefined;
    let emailVerified = false;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google token');
      }
      googleSub = payload.sub;
      email = payload.email?.toLowerCase();
      fullName = payload.name;
      emailVerified = payload.email_verified === true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google token');
    }

    let user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ googleSub }, ...(email ? [{ email }] : [])],
      },
    });

    if (user) {
      if (user.status !== AccountStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleSub: user.googleSub ?? googleSub,
          email: user.email ?? email ?? null,
          emailVerifiedAt:
            user.emailVerifiedAt ??
            (emailVerified && email ? new Date() : undefined),
          fullName: user.fullName || fullName || user.fullName,
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          googleSub,
          email: email ?? null,
          fullName: fullName?.trim() || 'Google User',
          role: UserRole.CUSTOMER,
          status: AccountStatus.ACTIVE,
          locale: Locale.ar,
          emailVerifiedAt: emailVerified && email ? new Date() : null,
        },
      });
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.revokeAllRefreshTokens(existing.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (
      !existing.user ||
      existing.user.deletedAt ||
      existing.user.status !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Invalid or inactive user');
    }

    const {
      rawToken,
      tokenHash: newHash,
      expiresAt,
    } = this.createRefreshTokenValues();

    const created = await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: newHash,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: next.id,
        },
      });

      return next;
    });

    void created;

    return this.issueTokens(existing.user, rawToken, newHash, expiresAt);
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.findByIdentifier(dto.identifier.trim());

    if (user && user.status === AccountStatus.ACTIVE) {
      const plainToken = randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(plainToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
        },
      });

      this.logger.log(
        `Password reset token for ${dto.identifier.trim()}: ${plainToken}`,
      );
    }

    return {
      message:
        'If an account exists, a password reset token has been generated',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        deletedAt: null,
      },
    });

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { message: 'Password updated successfully' };
  }

  async issueTokens(
    user: User,
    existingRawRefresh?: string,
    existingHash?: string,
    existingExpiresAt?: Date,
  ): Promise<AuthTokensResponse> {
    const accessExpires = this.config.get<string>('jwt.accessExpires') ?? '15m';
    const expiresIn = accessExpires as `${number}${'s' | 'm' | 'h' | 'd'}`;

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        role: user.role,
        locale: user.locale,
      },
      {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn,
      },
    );

    let refreshToken = existingRawRefresh;
    let tokenHash = existingHash;
    let expiresAt = existingExpiresAt;

    if (!refreshToken || !tokenHash || !expiresAt) {
      const created = this.createRefreshTokenValues();
      refreshToken = created.rawToken;
      tokenHash = created.tokenHash;
      expiresAt = created.expiresAt;

      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpires,
      user: this.usersService.toPublicUser(user),
    };
  }

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const normalized = identifier.includes('@')
      ? identifier.toLowerCase()
      : identifier;

    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: normalized }, { phone: identifier }],
      },
    });
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private createRefreshTokenValues(): {
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const refreshExpires =
      this.config.get<string>('jwt.refreshExpires') ?? '30d';
    const expiresAt = new Date(
      Date.now() + this.parseDurationToMs(refreshExpires),
    );

    return { rawToken, tokenHash, expiresAt };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationToMs(value: string): number {
    const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
    if (!match) {
      return 30 * 24 * 60 * 60 * 1000;
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * (multipliers[unit] ?? multipliers.d);
  }
}
