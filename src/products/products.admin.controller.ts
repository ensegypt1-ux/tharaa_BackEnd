import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { BulkReassignProductsDto } from './dto/bulk-reassign-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

@ApiTags('admin-products')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly audit: AdminAuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin list products' })
  @ApiResponse({
    status: 200,
    description: 'Products listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  list(@Query() dto: ListProductsDto) {
    return this.productsService.adminList(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin get product by id' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.adminFindById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({
    status: 201,
    description: 'Product created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateProductDto,
  ) {
    const created = await this.productsService.create(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_CREATE',
      entityType: 'Product',
      entityId: created.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Post('bulk-reassign')
  @ApiOperation({ summary: 'Bulk reassign products to a category/subcategory' })
  @ApiResponse({
    status: 200,
    description: 'Products reassigned',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async bulkReassign(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: BulkReassignProductsDto,
  ) {
    const result = await this.productsService.bulkReassign(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_BULK_REASSIGN',
      entityType: 'Product',
      entityId: dto.categoryId,
      newValues: {
        categoryId: dto.categoryId,
        productIds: dto.productIds,
        updated: result.updated,
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({
    status: 200,
    description: 'Product updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const updated = await this.productsService.update(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_UPDATE',
      entityType: 'Product',
      entityId: id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete product' })
  @ApiResponse({
    status: 200,
    description: 'Product deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.productsService.softDelete(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_DELETE',
      entityType: 'Product',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/variants')
  @ApiOperation({ summary: 'Create product variant' })
  @ApiResponse({
    status: 201,
    description: 'Variant created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.createVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  @ApiOperation({ summary: 'Update product variant' })
  @ApiResponse({
    status: 200,
    description: 'Variant updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @ApiOperation({ summary: 'Soft-delete product variant' })
  @ApiResponse({
    status: 200,
    description: 'Variant deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  removeVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.productsService.softDeleteVariant(id, variantId);
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Upload product image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        isPrimary: { type: 'boolean' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body('isPrimary') isPrimaryRaw?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const saved = await this.storage.save(
      file.buffer,
      'products',
      file.mimetype,
    );

    const isPrimary =
      isPrimaryRaw === 'true' || isPrimaryRaw === '1' || isPrimaryRaw === 'yes';

    const result = await this.productsService.addImage(id, saved.path, {
      isPrimary,
    });
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_IMAGE_UPLOAD',
      entityType: 'Product',
      entityId: id,
      newValues: { path: saved.path, isPrimary },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Patch(':id/images/:imageId/primary')
  @ApiOperation({ summary: 'Set primary product image' })
  @ApiResponse({
    status: 200,
    description: 'Primary image set',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  setPrimaryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.productsService.setPrimaryImage(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Delete product image' })
  @ApiResponse({
    status: 200,
    description: 'Image deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async deleteImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    const result = await this.productsService.deleteImage(id, imageId);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'PRODUCT_IMAGE_DELETE',
      entityType: 'ProductImage',
      entityId: imageId,
      newValues: { productId: id },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
