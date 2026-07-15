export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export type StorageFolder =
  | 'products'
  | 'categories'
  | 'offers'
  | 'campaigns'
  | 'users';

export interface StorageSaveResult {
  path: string;
  url: string;
}

export abstract class StorageService {
  abstract save(
    buffer: Buffer,
    folder: StorageFolder,
    mimeType: string,
  ): Promise<StorageSaveResult>;

  abstract delete(relativePath: string): Promise<void>;

  abstract getPublicUrl(relativePath: string): string;

  abstract ensureFolders(): void;
}
