import { Module } from '@nestjs/common';
import { AdminInventoryController } from './inventory.admin.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [AdminInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
