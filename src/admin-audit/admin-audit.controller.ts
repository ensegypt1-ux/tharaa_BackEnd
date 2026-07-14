import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AdminAuditService } from './admin-audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('admin-audit')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@ApiResponse({ status: 403, description: 'Forbidden', type: ApiErrorDto })
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: 'List admin activity audit logs' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs listed',
    type: ApiSuccessDto,
  })
  list(@Query() dto: ListAuditLogsDto) {
    return this.auditService.list(dto);
  }
}
