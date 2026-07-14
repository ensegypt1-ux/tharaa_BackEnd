import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [DeliveryModule, UploadsModule],
  controllers: [BootstrapController],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
