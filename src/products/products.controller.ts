import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ListProductsDto } from './dto/list-products.dto';
import { ProductFeedQueryDto } from './dto/product-feed-query.dto';
import { ProductListResponseDto } from './dto/product-list-response.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get()
  @ApiOperation({
    summary:
      'List public products with filters (includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Products listed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  list(@Query() dto: ListProductsDto, @CurrentUser() user?: User | null) {
    return this.productsService.listPublic(dto, user?.id);
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get('flash-deals')
  @ApiOperation({
    summary:
      'List active flash-deal products from offers and sale prices (includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Flash-deal products listed',
    type: ProductListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  listFlashDeals(
    @Query() dto: ProductFeedQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.productsService.listFlashDeals(dto, user?.id);
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get('recommended')
  @ApiOperation({
    summary:
      'List recommended products (currently isFeatured; includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recommended products listed',
    type: ProductListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  listRecommended(
    @Query() dto: ProductFeedQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.productsService.listRecommended(dto, user?.id);
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get(':id/similar')
  @ApiOperation({
    summary:
      'List similar products in the same category (includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Similar products listed',
    type: ProductListResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  listSimilar(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ProductFeedQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.productsService.listSimilar(id, dto, user?.id);
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get(':id/frequently-bought-together')
  @ApiOperation({
    summary:
      'List products frequently bought together with this product from completed orders (includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Frequently bought together products listed',
    type: ProductListResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  listFrequentlyBoughtTogether(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: ProductFeedQueryDto,
    @CurrentUser() user?: User | null,
  ) {
    return this.productsService.listFrequentlyBoughtTogether(id, dto, user?.id);
  }

  @Public()
  @OptionalAuth()
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({
    summary:
      'Get a public product by id (includes isFavorited when authenticated)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User | null,
  ) {
    return this.productsService.findPublicById(id, user?.id);
  }
}
