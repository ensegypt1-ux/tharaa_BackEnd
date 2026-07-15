import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CampaignsService } from './campaigns.service';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List currently active public campaigns' })
  @ApiResponse({
    status: 200,
    description: 'Campaigns listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.campaignsService.listPublicActive();
  }
}
