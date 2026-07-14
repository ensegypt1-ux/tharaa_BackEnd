import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OffersModule } from '../offers/offers.module';
import { PricingModule } from '../pricing/pricing.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminProductsController } from './products.admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [UploadsModule, PricingModule, InventoryModule, OffersModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
