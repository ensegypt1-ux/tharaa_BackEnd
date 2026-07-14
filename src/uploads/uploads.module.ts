import { Module } from '@nestjs/common';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { STORAGE_SERVICE } from './storage.service';

@Module({
  providers: [
    LocalDiskStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: LocalDiskStorageService,
    },
  ],
  exports: [LocalDiskStorageService, STORAGE_SERVICE],
})
export class UploadsModule {}
