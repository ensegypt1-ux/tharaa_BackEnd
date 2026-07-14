import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public products with filters' })
  @ApiResponse({
    status: 200,
    description: 'Products listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  list(@Query() dto: ListProductsDto) {
    return this.productsService.listPublic(dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a public product by id' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findPublicById(id);
  }
}
