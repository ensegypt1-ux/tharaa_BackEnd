import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, normalize, relative, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import {
  StorageFolder,
  StorageSaveResult,
  StorageService,
} from './storage.service';

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@Injectable()
export class LocalDiskStorageService
  extends StorageService
  implements OnModuleInit
{
  private readonly storageRoot: string;
  private readonly publicBaseUrl: string;
  private readonly maxUploadBytes: number;
  private readonly allowedMimes: string[];
  private readonly folders: StorageFolder[] = [
    'products',
    'categories',
    'offers',
    'users',
  ];

  constructor(private readonly configService: ConfigService) {
    super();
    this.storageRoot = resolve(
      this.configService.getOrThrow<string>('storage.root'),
    );
    this.publicBaseUrl = this.configService
      .getOrThrow<string>('storage.publicBaseUrl')
      .replace(/\/$/, '');
    this.maxUploadBytes = this.configService.getOrThrow<number>(
      'storage.maxUploadBytes',
    );
    this.allowedMimes = this.configService.getOrThrow<string[]>(
      'storage.allowedMimes',
    );
  }

  onModuleInit() {
    this.ensureFolders();
  }

  ensureFolders(): void {
    if (!existsSync(this.storageRoot)) {
      mkdirSync(this.storageRoot, { recursive: true });
    }
    for (const folder of this.folders) {
      const folderPath = join(this.storageRoot, folder);
      if (!existsSync(folderPath)) {
        mkdirSync(folderPath, { recursive: true });
      }
    }
  }

  async save(
    buffer: Buffer,
    folder: StorageFolder,
    mimeType: string,
  ): Promise<StorageSaveResult> {
    if (!this.allowedMimes.includes(mimeType)) {
      throw new BadRequestException(
        `MIME type not allowed: ${mimeType}. Allowed: ${this.allowedMimes.join(', ')}`,
      );
    }

    if (buffer.length > this.maxUploadBytes) {
      throw new PayloadTooLargeException(
        `File exceeds max upload size of ${this.maxUploadBytes} bytes`,
      );
    }

    if (!this.folders.includes(folder)) {
      throw new BadRequestException(`Invalid storage folder: ${folder}`);
    }

    const extension =
      MIME_EXTENSION[mimeType] || this.extensionFromMime(mimeType) || '.bin';
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `${folder}/${filename}`.replace(/\\/g, '/');
    const absolutePath = this.resolveSafePath(relativePath);

    writeFileSync(absolutePath, buffer);

    return {
      path: relativePath,
      url: this.getPublicUrl(relativePath),
    };
  }

  async delete(relativePath: string): Promise<void> {
    if (!relativePath) {
      return;
    }
    const absolutePath = this.resolveSafePath(relativePath);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
  }

  getPublicUrl(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${this.publicBaseUrl}/${normalized}`;
  }

  private resolveSafePath(relativePath: string): string {
    const normalizedRelative = normalize(relativePath).replace(/^([/\\])+/, '');
    const absolutePath = resolve(this.storageRoot, normalizedRelative);
    const relativeToRoot = relative(this.storageRoot, absolutePath);

    if (
      relativeToRoot.startsWith('..') ||
      relativeToRoot.includes(`..${sep}`) ||
      !absolutePath
        .toLowerCase()
        .startsWith(this.storageRoot.toLowerCase() + sep)
    ) {
      throw new BadRequestException('Invalid storage path');
    }

    return absolutePath;
  }

  private extensionFromMime(mimeType: string): string | null {
    const parts = mimeType.split('/');
    if (parts.length !== 2 || !parts[1]) {
      return null;
    }
    return `.${parts[1].split('+')[0]}`;
  }
}
