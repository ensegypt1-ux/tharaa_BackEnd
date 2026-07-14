import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active public categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories listed',
    type: ApiSuccessDto,
  })
  list() {
    return this.categoriesService.listPublic();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a public category by id' })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findPublicById(id);
  }
}
