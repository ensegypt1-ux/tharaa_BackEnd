import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { BootstrapService } from './bootstrap.service';
import { BootstrapResponseDto } from './dto/bootstrap-response.dto';

@ApiTags('bootstrap')
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Application bootstrap payload for Flutter startup',
    description:
      'Single startup endpoint containing app config, store info, delivery/pickup settings, payments, fulfilment, auth flags, notifications, and feature flags. Sourced from AppSettings + DeliverySettings + PickupSettings.',
  })
  @ApiOkResponse({
    description: 'Bootstrap configuration',
    type: BootstrapResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable',
    type: ApiErrorDto,
  })
  getBootstrap() {
    return this.bootstrapService.getBootstrap();
  }
}
