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
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@ApiTags('admin-campaigns')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly audit: AdminAuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin list campaigns' })
  @ApiResponse({
    status: 200,
    description: 'Campaigns listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.campaignsService.adminList();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin get campaign by id' })
  @ApiResponse({
    status: 200,
    description: 'Campaign retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.adminFindById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create campaign' })
  @ApiResponse({
    status: 201,
    description: 'Campaign created',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateCampaignDto,
  ) {
    const created = await this.campaignsService.create(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CAMPAIGN_CREATE',
      entityType: 'Campaign',
      entityId: created.id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update campaign' })
  @ApiResponse({
    status: 200,
    description: 'Campaign updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const updated = await this.campaignsService.update(id, dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CAMPAIGN_UPDATE',
      entityType: 'Campaign',
      entityId: id,
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete campaign' })
  @ApiResponse({
    status: 200,
    description: 'Campaign deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  async remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.campaignsService.softDelete(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CAMPAIGN_DELETE',
      entityType: 'Campaign',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Remove campaign image' })
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
    const updated = await this.campaignsService.removeImage(id);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CAMPAIGN_IMAGE_REMOVE',
      entityType: 'Campaign',
      entityId: id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Upload or replace campaign image' })
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
      'campaigns',
      file.mimetype,
    );
    const updated = await this.campaignsService.setImage(id, saved.path);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'CAMPAIGN_IMAGE_UPLOAD',
      entityType: 'Campaign',
      entityId: id,
      newValues: { imagePath: saved.path },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
