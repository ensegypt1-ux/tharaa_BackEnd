import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminProductImagesController } from './admin-product-images.controller';
import { AdminProductImagesService } from './admin-product-images.service';

@Module({
  imports: [UploadsModule],
  controllers: [AdminProductImagesController],
  providers: [AdminProductImagesService],
})
export class AdminProductImagesModule {}
