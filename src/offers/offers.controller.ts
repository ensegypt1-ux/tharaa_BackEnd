import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { OffersService } from './offers.service';

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List currently active public offers' })
  @ApiResponse({
    status: 200,
    description: 'Offers listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.offersService.listPublicActive();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get an active public offer by id' })
  @ApiResponse({
    status: 200,
    description: 'Offer retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.offersService.findPublicById(id);
  }
}
