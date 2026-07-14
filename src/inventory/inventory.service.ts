import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inventory, InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EnsureInventoryInput = {
  productId?: string;
  variantId?: string;
};

export type OrderStockLine = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureInventory(input: EnsureInventoryInput): Promise<Inventory> {
    if (input.variantId) {
      return this.prisma.inventory.upsert({
        where: { variantId: input.variantId },
        create: {
          variantId: input.variantId,
          quantity: 0,
          reservedQuantity: 0,
        },
        update: {},
      });
    }

    if (input.productId) {
      return this.prisma.inventory.upsert({
        where: { productId: input.productId },
        create: {
          productId: input.productId,
          quantity: 0,
          reservedQuantity: 0,
        },
        update: {},
      });
    }

    throw new BadRequestException('productId or variantId is required');
  }

  getAvailable(
    inventory: Pick<Inventory, 'quantity' | 'reservedQuantity'>,
  ): number {
    return inventory.quantity - inventory.reservedQuantity;
  }

  async getAvailableByTarget(input: EnsureInventoryInput): Promise<number> {
    const inventory = await this.findInventoryOrThrow(input);
    return this.getAvailable(inventory);
  }

  /**
   * PENDING create: increase reservedQuantity only (quantity unchanged, no movement).
   */
  async reserveForOrder(
    tx: Prisma.TransactionClient,
    lines: OrderStockLine[],
  ): Promise<void> {
    for (const line of lines) {
      const locked = await this.lockInventoryRow(tx, {
        productId: line.variantId ? undefined : line.productId,
        variantId: line.variantId ?? undefined,
      });

      const available = this.getAvailable(locked);
      if (line.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock (available: ${available})`,
        );
      }

      await tx.inventory.update({
        where: { id: locked.id },
        data: { reservedQuantity: locked.reservedQuantity + line.quantity },
      });
    }
  }

  /**
   * CONFIRMED: quantity -= n; reservedQuantity -= n; ORDER_CONFIRM movement.
   */
  async confirmReservation(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: OrderStockLine[],
    createdByUserId?: string,
  ): Promise<void> {
    for (const line of lines) {
      const locked = await this.lockInventoryRow(tx, {
        productId: line.variantId ? undefined : line.productId,
        variantId: line.variantId ?? undefined,
      });

      if (locked.reservedQuantity < line.quantity) {
        throw new BadRequestException('Reserved stock mismatch');
      }
      if (locked.quantity < line.quantity) {
        throw new BadRequestException('Insufficient inventory quantity');
      }

      const nextQuantity = locked.quantity - line.quantity;
      const nextReserved = locked.reservedQuantity - line.quantity;

      await tx.inventory.update({
        where: { id: locked.id },
        data: {
          quantity: nextQuantity,
          reservedQuantity: nextReserved,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: locked.id,
          type: InventoryMovementType.ORDER_CONFIRM,
          quantityChange: -line.quantity,
          quantityAfter: nextQuantity,
          orderId,
          createdByUserId,
        },
      });
    }
  }

  /**
   * CANCEL while PENDING: reservedQuantity -= n only.
   */
  async releaseReservation(
    tx: Prisma.TransactionClient,
    lines: OrderStockLine[],
  ): Promise<void> {
    for (const line of lines) {
      const locked = await this.lockInventoryRow(tx, {
        productId: line.variantId ? undefined : line.productId,
        variantId: line.variantId ?? undefined,
      });

      if (locked.reservedQuantity < line.quantity) {
        throw new BadRequestException('Reserved stock mismatch');
      }

      await tx.inventory.update({
        where: { id: locked.id },
        data: { reservedQuantity: locked.reservedQuantity - line.quantity },
      });
    }
  }

  /**
   * CANCEL after CONFIRMED: quantity += n; ORDER_CANCEL movement; reserved untouched.
   */
  async restoreOnCancelAfterConfirm(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: OrderStockLine[],
    createdByUserId?: string,
  ): Promise<void> {
    for (const line of lines) {
      const locked = await this.lockInventoryRow(tx, {
        productId: line.variantId ? undefined : line.productId,
        variantId: line.variantId ?? undefined,
      });

      const nextQuantity = locked.quantity + line.quantity;

      await tx.inventory.update({
        where: { id: locked.id },
        data: { quantity: nextQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: locked.id,
          type: InventoryMovementType.ORDER_CANCEL,
          quantityChange: line.quantity,
          quantityAfter: nextQuantity,
          orderId,
          createdByUserId,
        },
      });
    }
  }

  async lockInventoryById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Inventory> {
    const rows = await tx.$queryRaw<Inventory[]>`
      SELECT *
      FROM "Inventory"
      WHERE id = ${id}
      FOR UPDATE
    `;

    if (!rows.length) {
      throw new NotFoundException('Inventory not found');
    }

    const row = rows[0];
    return {
      ...row,
      quantity: Number(row.quantity),
      reservedQuantity: Number(row.reservedQuantity),
    };
  }

  async adjustManual(
    input: EnsureInventoryInput & {
      delta: number;
      userId?: string;
      note?: string;
    },
  ) {
    if (!input.productId && !input.variantId) {
      throw new BadRequestException('productId or variantId is required');
    }
    if (input.productId && input.variantId) {
      throw new BadRequestException(
        'Provide either productId or variantId, not both',
      );
    }
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new BadRequestException('delta must be a non-zero integer');
    }

    await this.ensureInventory({
      productId: input.productId,
      variantId: input.variantId,
    });

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockInventoryRow(tx, {
        productId: input.productId,
        variantId: input.variantId,
      });

      const nextQuantity = locked.quantity + input.delta;
      if (nextQuantity < 0) {
        throw new BadRequestException('Insufficient inventory quantity');
      }
      if (nextQuantity < locked.reservedQuantity) {
        throw new BadRequestException(
          'Quantity cannot go below reserved quantity',
        );
      }

      const movementType =
        input.delta > 0
          ? InventoryMovementType.MANUAL_IN
          : InventoryMovementType.MANUAL_OUT;

      const updated = await tx.inventory.update({
        where: { id: locked.id },
        data: { quantity: nextQuantity },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryId: updated.id,
          type: movementType,
          quantityChange: input.delta,
          quantityAfter: updated.quantity,
          note: input.note,
          createdByUserId: input.userId,
        },
      });

      return {
        inventory: {
          id: updated.id,
          productId: updated.productId,
          variantId: updated.variantId,
          quantity: updated.quantity,
          reservedQuantity: updated.reservedQuantity,
          available: this.getAvailable(updated),
          updatedAt: updated.updatedAt,
        },
        movement,
      };
    });
  }

  async setQuantity(
    input: EnsureInventoryInput & {
      quantity: number;
      userId?: string;
      note?: string;
    },
  ) {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new BadRequestException('quantity must be a non-negative integer');
    }
    await this.ensureInventory({
      productId: input.productId,
      variantId: input.variantId,
    });
    const current = await this.findInventoryOrThrow(input);
    const delta = input.quantity - current.quantity;
    if (delta === 0) {
      return {
        inventory: {
          id: current.id,
          productId: current.productId,
          variantId: current.variantId,
          quantity: current.quantity,
          reservedQuantity: current.reservedQuantity,
          available: this.getAvailable(current),
          updatedAt: current.updatedAt,
        },
        movement: null,
      };
    }
    return this.adjustManual({
      productId: input.productId,
      variantId: input.variantId,
      delta,
      userId: input.userId,
      note: input.note ?? `Set quantity to ${input.quantity}`,
    });
  }

  async adminList(dto: {
    page?: number;
    limit?: number;
    q?: string;
    categoryId?: string;
    stockStatus?: 'all' | 'low' | 'out';
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const stockStatus = dto.stockStatus ?? 'all';

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        productId: string | null;
        variantId: string | null;
        quantity: number;
        reservedQuantity: number;
        updatedAt: Date;
        productNameAr: string | null;
        productNameEn: string | null;
        sku: string | null;
        categoryId: string | null;
        categoryNameAr: string | null;
        categoryNameEn: string | null;
        lowStockThreshold: number | null;
        variantNameAr: string | null;
        variantNameEn: string | null;
      }[]
    >`
      SELECT i.id,
             i."productId",
             i."variantId",
             i.quantity,
             i."reservedQuantity",
             i."updatedAt",
             COALESCE(p."nameAr", vp."nameAr") AS "productNameAr",
             COALESCE(p."nameEn", vp."nameEn") AS "productNameEn",
             COALESCE(p.sku, v.sku) AS sku,
             COALESCE(p."categoryId", vp."categoryId") AS "categoryId",
             COALESCE(c."nameAr", vc."nameAr") AS "categoryNameAr",
             COALESCE(c."nameEn", vc."nameEn") AS "categoryNameEn",
             COALESCE(p."lowStockThreshold", vp."lowStockThreshold") AS "lowStockThreshold",
             v."nameAr" AS "variantNameAr",
             v."nameEn" AS "variantNameEn"
      FROM "Inventory" i
      LEFT JOIN "Product" p ON p.id = i."productId" AND p."deletedAt" IS NULL
      LEFT JOIN "ProductVariant" v ON v.id = i."variantId" AND v."deletedAt" IS NULL
      LEFT JOIN "Product" vp ON vp.id = v."productId" AND vp."deletedAt" IS NULL
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Category" vc ON vc.id = vp."categoryId"
      WHERE (p.id IS NOT NULL OR vp.id IS NOT NULL)
      ORDER BY i."updatedAt" DESC
    `;

    let filtered = rows.map((r) => {
      const available = Number(r.quantity) - Number(r.reservedQuantity);
      const threshold = Number(r.lowStockThreshold ?? 5);
      let status: 'IN_STOCK' | 'LOW' | 'OUT' = 'IN_STOCK';
      if (available <= 0) status = 'OUT';
      else if (available <= threshold) status = 'LOW';
      return {
        id: r.id,
        productId: r.productId ?? (r.variantId ? undefined : null),
        variantId: r.variantId,
        productNameAr: r.productNameAr,
        productNameEn: r.productNameEn,
        variantNameAr: r.variantNameAr,
        variantNameEn: r.variantNameEn,
        sku: r.sku,
        categoryId: r.categoryId,
        categoryNameAr: r.categoryNameAr,
        categoryNameEn: r.categoryNameEn,
        quantity: Number(r.quantity),
        reservedQuantity: Number(r.reservedQuantity),
        available,
        lowStockThreshold: threshold,
        stockStatus: status,
        updatedAt: r.updatedAt,
      };
    });

    if (dto.categoryId) {
      filtered = filtered.filter((r) => r.categoryId === dto.categoryId);
    }
    if (dto.q?.trim()) {
      const q = dto.q.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.productNameAr?.toLowerCase().includes(q) ||
          r.productNameEn?.toLowerCase().includes(q) ||
          r.sku?.toLowerCase().includes(q) ||
          r.variantNameAr?.toLowerCase().includes(q) ||
          r.variantNameEn?.toLowerCase().includes(q),
      );
    }
    if (stockStatus === 'low') {
      filtered = filtered.filter((r) => r.stockStatus === 'LOW');
    } else if (stockStatus === 'out') {
      filtered = filtered.filter((r) => r.stockStatus === 'OUT');
    }

    const total = filtered.length;
    const data = filtered.slice(skip, skip + limit);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async listMovements(dto: {
    page?: number;
    limit?: number;
    productId?: string;
    variantId?: string;
    inventoryId?: string;
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    let inventoryId = dto.inventoryId;
    if (!inventoryId && (dto.productId || dto.variantId)) {
      const inv = await this.findInventoryOrThrow({
        productId: dto.productId,
        variantId: dto.variantId,
      });
      inventoryId = inv.id;
    }

    const where: Prisma.InventoryMovementWhereInput = {
      ...(inventoryId ? { inventoryId } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          inventory: {
            select: { id: true, productId: true, variantId: true },
          },
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

  private async findInventoryOrThrow(
    input: EnsureInventoryInput,
  ): Promise<Inventory> {
    const inventory = input.variantId
      ? await this.prisma.inventory.findUnique({
          where: { variantId: input.variantId },
        })
      : input.productId
        ? await this.prisma.inventory.findUnique({
            where: { productId: input.productId },
          })
        : null;

    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }
    return inventory;
  }

  private async lockInventoryRow(
    tx: Prisma.TransactionClient,
    input: EnsureInventoryInput,
  ): Promise<Inventory> {
    let existing: Inventory | null = null;

    if (input.variantId) {
      existing = await tx.inventory.findUnique({
        where: { variantId: input.variantId },
      });
    } else if (input.productId) {
      existing = await tx.inventory.findUnique({
        where: { productId: input.productId },
      });
    } else {
      throw new BadRequestException('productId or variantId is required');
    }

    if (!existing) {
      throw new NotFoundException('Inventory not found');
    }

    return this.lockInventoryById(tx, existing.id);
  }
}
