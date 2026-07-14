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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryImageFromUrlDto } from './dto/category-image-from-url.dto';
import { SearchCategoryImagesDto } from './dto/search-category-images.dto';

@ApiTags('admin-categories')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly audit: AdminAuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Admin list categories (product counts, active/inactive, out-of-stock)',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.categoriesService.adminList();
  }

  @Get('pexels-search')
  @ApiOperation({ summary: 'Search Pexels images for a category (manual assign)' })
  @ApiResponse({
    status: 200,
    description: 'Image search results',
    type: ApiSuccessDto,
  })
  searchPexels(@Query() dto: SearchCategoryImagesDto) {
    return this.categoriesService.searchPexels(dto);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Category product/price statistics' })
  @ApiResponse({
    status: 200,
    description: 'Category stats',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.getStats(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin get category by id' })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.adminFindById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @ApiResponse({
    status: 201,
    description: 'Category created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateCategoryDto,
  ) {
    const created = await this.categoriesService.create(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_CREATE',
      entityType: 'Category',
      entityId: created.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category (activate/deactivate/sortOrder)' })
  @ApiResponse({
    status: 200,
    description: 'Category updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const previous = await this.categoriesService.adminFindById(id);
    const updated = await this.categoriesService.update(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_UPDATE',
      entityType: 'Category',
      entityId: id,
      previousValues: previous,
      newValues: updated,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete category' })
  @ApiResponse({
    status: 200,
    description: 'Category deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.categoriesService.softDelete(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_DELETE',
      entityType: 'Category',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Remove category image' })
  @ApiResponse({
    status: 200,
    description: 'Image removed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async removeImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const updated = await this.categoriesService.removeImage(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_IMAGE_REMOVE',
      entityType: 'Category',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/image/from-url')
  @ApiOperation({
    summary: 'Download approved external image and set as category image',
  })
  @ApiResponse({
    status: 201,
    description: 'Image stored locally and assigned',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async imageFromUrl(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryImageFromUrlDto,
  ) {
    const updated = await this.categoriesService.setImageFromUrl(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_IMAGE_FROM_URL',
      entityType: 'Category',
      entityId: id,
      newValues: {
        imageUrl: dto.imageUrl,
        sourceProvider: dto.sourceProvider || 'pexels',
        photographer: dto.photographer,
      },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Upload or replace category image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
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
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const saved = await this.storage.save(
      file.buffer,
      'categories',
      file.mimetype,
    );
    const updated = await this.categoriesService.setImage(id, saved.path);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CATEGORY_IMAGE_UPLOAD',
      entityType: 'Category',
      entityId: id,
      newValues: { imagePath: saved.path },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
