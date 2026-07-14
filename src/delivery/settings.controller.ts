import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { DeliveryService } from './delivery.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Public delivery, pickup, and service city settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Settings retrieved',
    type: ApiSuccessDto,
  })
  getPublic() {
    return this.deliveryService.getPublicSettings();
  }
}
