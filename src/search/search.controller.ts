import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import {
  ListRecentSearchesDto,
  PopularSearchesQueryDto,
  RecordSearchDto,
  SearchSuggestionsQueryDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('suggestions')
  @ApiOperation({
    summary: 'Product search suggestions for autocomplete (active products)',
  })
  @ApiResponse({
    status: 200,
    description: 'Suggestions listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  suggestions(@Query() query: SearchSuggestionsQueryDto) {
    return this.searchService.suggestions(query);
  }

  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Most popular search terms (no user data)' })
  @ApiResponse({
    status: 200,
    description: 'Popular searches listed',
    type: ApiSuccessDto,
  })
  popular(@Query() query: PopularSearchesQueryDto) {
    return this.searchService.popular(query);
  }

  @Public()
  @OptionalAuth()
  @Post('record')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Record a search term (increments popular; upserts recent when authenticated)',
  })
  @ApiResponse({
    status: 201,
    description: 'Search recorded',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  record(@Body() dto: RecordSearchDto, @CurrentUser() user?: User | null) {
    return this.searchService.record(dto.term, user?.id);
  }

  @Get('recent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my recent searches (most recent first)' })
  @ApiResponse({
    status: 200,
    description: 'Recent searches listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  listRecent(@CurrentUser() user: User, @Query() query: ListRecentSearchesDto) {
    return this.searchService.listRecent(user.id, query);
  }

  @Delete('recent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear all my recent searches' })
  @ApiResponse({
    status: 200,
    description: 'Recent searches cleared',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  clearRecent(@CurrentUser() user: User) {
    return this.searchService.clearRecent(user.id);
  }

  @Delete('recent/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete one recent search entry' })
  @ApiResponse({
    status: 200,
    description: 'Recent search deleted',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  deleteRecent(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.searchService.deleteRecent(user.id, id);
  }
}
