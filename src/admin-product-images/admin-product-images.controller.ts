import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { Request } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdminProductImagesService } from './admin-product-images.service';
import {
  ListMissingImagesDto,
  SearchProductImagesDto,
  SelectProductImageDto,
} from './dto/product-images.dto';

@ApiTags('admin-product-images')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/product-images')
export class AdminProductImagesController {
  constructor(
    private readonly imagesService: AdminProductImagesService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search Pexels images for a product (GET)' })
  @ApiResponse({
    status: 200,
    description: 'Image search results',
    type: ApiSuccessDto,
  })
  searchGet(@Query() dto: SearchProductImagesDto) {
    return this.imagesService.search(dto);
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search Pexels images for a product (POST body alias)',
  })
  @ApiResponse({
    status: 200,
    description: 'Image search results',
    type: ApiSuccessDto,
  })
  searchPost(@Body() dto: SearchProductImagesDto) {
    return this.imagesService.search(dto);
  }

  @Post('select')
  @ApiOperation({
    summary: 'Download a selected external image and attach to product',
  })
  @ApiResponse({
    status: 201,
    description: 'Image stored locally and attached',
    type: ApiSuccessDto,
  })
  async select(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: SelectProductImageDto,
  ) {
    const image = await this.imagesService.selectAndStore(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_IMAGE_PEXELS_SELECT',
      entityType: 'ProductImage',
      entityId: image.id,
      newValues: {
        productId: dto.productId,
        sourceProvider: dto.sourceProvider || 'pexels',
        photographer: dto.photographer,
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return image;
  }

  @Get('missing')
  @ApiOperation({ summary: 'List products missing images' })
  @ApiResponse({
    status: 200,
    description: 'Missing-image products listed',
    type: ApiSuccessDto,
  })
  listMissing(@Query() dto: ListMissingImagesDto) {
    return this.imagesService.listMissing(dto);
  }

  @Patch(':productId/reviewed')
  @ApiOperation({ summary: 'Mark product missing-image workflow as reviewed/skipped' })
  @ApiResponse({
    status: 200,
    description: 'Product marked reviewed',
    type: ApiSuccessDto,
  })
  async markReviewed(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    const updated = await this.imagesService.markReviewed(productId, true);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_IMAGE_REVIEWED',
      entityType: 'Product',
      entityId: productId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
