import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  ApplyCartCouponDto,
  SetFulfilmentDto,
  SyncCartDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({
    summary: 'Get current user cart with server-side recalculation',
  })
  @ApiResponse({
    status: 200,
    description: 'Cart retrieved',
    type: ApiSuccessDto,
  })
  getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item to the cart' })
  @ApiResponse({ status: 201, description: 'Item added', type: ApiSuccessDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  addItem(@CurrentUser() user: User, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({
    status: 200,
    description: 'Item updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  updateItem(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove a cart item' })
  @ApiResponse({
    status: 200,
    description: 'Item removed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 404, description: 'Not Found', type: ApiErrorDto })
  removeItem(@CurrentUser() user: User, @Param('id') id: string) {
    return this.cartService.removeItem(user.id, id);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart cleared',
    type: ApiSuccessDto,
  })
  clearCart(@CurrentUser() user: User) {
    return this.cartService.clearCart(user.id);
  }

  @Post('coupon')
  @ApiOperation({ summary: 'Apply a coupon to the cart' })
  @ApiResponse({
    status: 200,
    description: 'Coupon applied',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  applyCoupon(@CurrentUser() user: User, @Body() dto: ApplyCartCouponDto) {
    return this.cartService.applyCoupon(user.id, dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove coupon from the cart' })
  @ApiResponse({
    status: 200,
    description: 'Coupon removed',
    type: ApiSuccessDto,
  })
  removeCoupon(@CurrentUser() user: User) {
    return this.cartService.removeCoupon(user.id);
  }

  @Patch('fulfilment')
  @ApiOperation({ summary: 'Set cart fulfilment type (delivery/pickup)' })
  @ApiResponse({
    status: 200,
    description: 'Fulfilment updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  setFulfilment(@CurrentUser() user: User, @Body() dto: SetFulfilmentDto) {
    return this.cartService.setFulfilmentType(user.id, dto.fulfilmentType);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Merge guest local cart items into the authenticated user cart',
  })
  @ApiResponse({ status: 200, description: 'Cart synced', type: ApiSuccessDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  syncCart(@CurrentUser() user: User, @Body() dto: SyncCartDto) {
    return this.cartService.syncCart(user.id, dto.items);
  }
}
