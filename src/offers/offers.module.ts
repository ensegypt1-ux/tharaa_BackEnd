import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminOffersController } from './offers.admin.controller';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [UploadsModule],
  controllers: [OffersController, AdminOffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
