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
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OffersService } from './offers.service';

@ApiTags('admin-offers')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/offers')
export class AdminOffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly audit: AdminAuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin list offers' })
  @ApiResponse({
    status: 200,
    description: 'Offers listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.offersService.adminList();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin get offer by id' })
  @ApiResponse({
    status: 200,
    description: 'Offer retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.offersService.adminFindById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create offer' })
  @ApiResponse({
    status: 201,
    description: 'Offer created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateOfferDto,
  ) {
    const created = await this.offersService.create(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'OFFER_CREATE',
      entityType: 'Offer',
      entityId: created.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update offer' })
  @ApiResponse({
    status: 200,
    description: 'Offer updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferDto,
  ) {
    const updated = await this.offersService.update(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'OFFER_UPDATE',
      entityType: 'Offer',
      entityId: id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete offer' })
  @ApiResponse({
    status: 200,
    description: 'Offer deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.offersService.softDelete(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'OFFER_DELETE',
      entityType: 'Offer',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Upload offer image' })
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

    const saved = await this.storage.save(file.buffer, 'offers', file.mimetype);
    const updated = await this.offersService.setImage(id, saved.path);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'OFFER_IMAGE_UPLOAD',
      entityType: 'Offer',
      entityId: id,
      newValues: { imagePath: saved.path },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
