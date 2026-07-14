import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export type AuditLogInput = {
  userId?: string | null;
  userRole?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    return this.prisma.adminAuditLog.create({
      data: {
        userId: input.userId ?? null,
        userRole: input.userRole ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        previousValues:
          input.previousValues === undefined
            ? undefined
            : (input.previousValues as Prisma.InputJsonValue),
        newValues:
          input.newValues === undefined
            ? undefined
            : (input.newValues as Prisma.InputJsonValue),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async list(dto: ListAuditLogsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AdminAuditLogWhereInput = {
      ...(dto.action ? { action: dto.action } : {}),
      ...(dto.entityType ? { entityType: dto.entityType } : {}),
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.from || dto.to
        ? {
            createdAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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
}
