import { Module } from '@nestjs/common';
import { AdminDeliveryController } from './admin-delivery.controller';
import { DeliveryService } from './delivery.service';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [SettingsController, AdminDeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
