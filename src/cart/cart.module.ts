import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PricingModule } from '../pricing/pricing.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [PricingModule, CouponsModule, DeliveryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
