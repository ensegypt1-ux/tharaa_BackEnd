import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Request } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import {
  ListInventoryDto,
  ListInventoryMovementsDto,
} from './dto/list-inventory.dto';
import { InventoryService } from './inventory.service';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SetInventoryQuantityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @ValidateIf((_, v) => v !== undefined && v !== null)
  note?: string;
}

@ApiTags('admin-inventory')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List inventory rows' })
  @ApiResponse({
    status: 200,
    description: 'Inventory listed',
    type: ApiSuccessDto,
  })
  list(@Query() dto: ListInventoryDto) {
    return this.inventoryService.adminList(dto);
  }

  @Get('movements')
  @ApiOperation({ summary: 'List inventory movements' })
  @ApiResponse({
    status: 200,
    description: 'Movements listed',
    type: ApiSuccessDto,
  })
  movements(@Query() dto: ListInventoryMovementsDto) {
    return this.inventoryService.listMovements(dto);
  }

  @Patch('adjust')
  @ApiOperation({ summary: 'Manually adjust inventory quantity' })
  @ApiResponse({
    status: 200,
    description: 'Inventory adjusted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async adjust(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: AdjustInventoryDto,
  ) {
    if (!dto.productId && !dto.variantId) {
      throw new BadRequestException('productId or variantId is required');
    }
    if (dto.productId && dto.variantId) {
      throw new BadRequestException(
        'Provide either productId or variantId, not both',
      );
    }

    const result = await this.inventoryService.adjustManual({
      productId: dto.productId,
      variantId: dto.variantId,
      delta: dto.delta,
      userId: user.id,
      note: dto.note,
    });

    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'INVENTORY_ADJUST',
      entityType: 'Inventory',
      entityId: result.inventory.id,
      newValues: { delta: dto.delta, note: dto.note },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }

  @Post('set-quantity')
  @ApiOperation({ summary: 'Set exact inventory quantity' })
  @ApiResponse({
    status: 200,
    description: 'Inventory quantity set',
    type: ApiSuccessDto,
  })
  async setQuantity(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: SetInventoryQuantityDto,
  ) {
    if (!dto.productId && !dto.variantId) {
      throw new BadRequestException('productId or variantId is required');
    }
    if (dto.productId && dto.variantId) {
      throw new BadRequestException(
        'Provide either productId or variantId, not both',
      );
    }

    const result = await this.inventoryService.setQuantity({
      productId: dto.productId,
      variantId: dto.variantId,
      quantity: dto.quantity,
      userId: user.id,
      note: dto.note,
    });

    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'INVENTORY_SET_QUANTITY',
      entityType: 'Inventory',
      entityId: result.inventory.id,
      newValues: { quantity: dto.quantity, note: dto.note },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return result;
  }
}
