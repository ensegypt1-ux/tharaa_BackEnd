import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
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
import { AdminSettingsService } from './admin-settings.service';
import {
  PatchAppSettingsDto,
  UpsertSingleSettingDto,
} from './dto/app-settings.dto';

@ApiTags('admin-settings')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settingsService: AdminSettingsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all AppSettings keys' })
  @ApiResponse({
    status: 200,
    description: 'Settings listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.settingsService.listAll();
  }

  @Patch('bootstrap')
  @ApiOperation({ summary: 'Patch bootstrap-compatible AppSettings groups' })
  @ApiResponse({
    status: 200,
    description: 'Bootstrap settings patched',
    type: ApiSuccessDto,
  })
  async patchBootstrap(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: PatchAppSettingsDto,
  ) {
    const updated = await this.settingsService.patchBootstrap(dto);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'SETTINGS_BOOTSTRAP_PATCH',
      entityType: 'AppSettings',
      newValues: dto,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get AppSettings value by key' })
  @ApiResponse({
    status: 200,
    description: 'Setting retrieved',
    type: ApiSuccessDto,
  })
  getOne(@Param('key') key: string) {
    return this.settingsService.getByKey(decodeURIComponent(key));
  }

  @Put(':key')
  @ApiOperation({ summary: 'Upsert AppSettings value by key' })
  @ApiResponse({
    status: 200,
    description: 'Setting upserted',
    type: ApiSuccessDto,
  })
  async upsert(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('key') key: string,
    @Body() dto: UpsertSingleSettingDto,
  ) {
    const decoded = decodeURIComponent(key);
    const previous = await this.settingsService
      .getByKey(decoded)
      .catch(() => null);
    const updated = await this.settingsService.upsert(decoded, dto.value);
    await this.audit.log({
      userId: user.id,
      userRole: user.role,
      userEmail: user.email,
      action: 'SETTINGS_UPDATE',
      entityType: 'AppSettings',
      entityId: decoded,
      previousValues: previous?.value ?? null,
      newValues: updated.value,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
