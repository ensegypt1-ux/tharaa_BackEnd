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
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AddWishlistItemDto, ListWishlistDto } from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'List my wishlist (active products only)' })
  @ApiResponse({
    status: 200,
    description: 'Wishlist listed',
    type: ApiSuccessDto,
  })
  list(@CurrentUser() user: User, @Query() query: ListWishlistDto) {
    return this.wishlistService.list(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Add a product to my wishlist' })
  @ApiResponse({
    status: 201,
    description: 'Added to wishlist',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Conflict', type: ApiErrorDto })
  add(@CurrentUser() user: User, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.add(user.id, dto.productId);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Remove a product from my wishlist' })
  @ApiResponse({
    status: 200,
    description: 'Removed from wishlist',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  remove(
    @CurrentUser() user: User,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }
}
