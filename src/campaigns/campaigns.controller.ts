import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CampaignPlacement } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CampaignsService } from './campaigns.service';
import {
  BulkTrackCampaignEventsDto,
  ListPublicCampaignsDto,
  TrackCampaignEventDto,
} from './dto/list-public-campaigns.dto';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'List currently active public campaigns (optional placement + targeting filters)',
  })
  @ApiResponse({
    status: 200,
    description: 'Campaigns listed',
    type: ApiSuccessDto,
  })
  list(@Query() query: ListPublicCampaignsDto) {
    return this.campaignsService.listPublicActive(query);
  }

  @Public()
  @Get('placement/:placement')
  @ApiOperation({ summary: 'List active campaigns for a specific placement' })
  @ApiParam({ name: 'placement', enum: CampaignPlacement })
  @ApiResponse({
    status: 200,
    description: 'Campaigns listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  listByPlacement(
    @Param('placement', new ParseEnumPipe(CampaignPlacement))
    placement: CampaignPlacement,
    @Query() query: ListPublicCampaignsDto,
  ) {
    return this.campaignsService.listByPlacement(placement, query);
  }

  @Public()
  @Post('track')
  @ApiOperation({ summary: 'Bulk track campaign impressions/clicks' })
  @ApiResponse({
    status: 201,
    description: 'Events tracked',
    type: ApiSuccessDto,
  })
  trackBulk(@Body() dto: BulkTrackCampaignEventsDto) {
    return this.campaignsService.trackBulk(dto);
  }

  @Public()
  @Post(':id/track')
  @ApiOperation({ summary: 'Track a single campaign impression or click' })
  @ApiResponse({
    status: 201,
    description: 'Event tracked',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  trackOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrackCampaignEventDto,
  ) {
    return this.campaignsService.trackEvent(id, dto);
  }
}
