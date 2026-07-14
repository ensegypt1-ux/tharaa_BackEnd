import { Body, Controller, Post } from '@nestjs/common';
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
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate a coupon for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Coupon validated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  async validate(@CurrentUser() user: User, @Body() dto: ValidateCouponDto) {
    const subtotal = dto.subtotal ?? 0;
    const result = await this.couponsService.validateCoupon(
      dto.code,
      user.id,
      subtotal,
      dto.fulfilmentType,
    );

    return {
      coupon: result.coupon,
      discountAmount: result.discountAmount,
      requiresSubtotal: dto.subtotal === undefined,
    };
  }
}
