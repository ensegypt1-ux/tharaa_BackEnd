import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFcmCredentialsFromConfig } from './firebase-admin.config';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private messaging: Messaging | null = null;
  private configured = false;
  private startupAttempted = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.initialize();
  }

  /**
   * Initializes Firebase Admin once per process. Safe to call multiple times.
   */
  initialize(): void {
    if (this.startupAttempted) {
      return;
    }
    this.startupAttempted = true;

    const credentials = readFcmCredentialsFromConfig(this.config);
    if (!credentials) {
      this.logger.warn(
        'Firebase Admin: not configured (set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY to enable push notifications)',
      );
      return;
    }

    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert(credentials),
        });
        this.logger.log(
          `Firebase Admin: initialized for project "${credentials.projectId}"`,
        );
      } else {
        this.logger.log(
          `Firebase Admin: reusing existing app for project "${credentials.projectId}"`,
        );
      }

      this.messaging = getMessaging();
      this.configured = true;
    } catch (error) {
      this.messaging = null;
      this.configured = false;
      this.logger.error(
        'Firebase Admin: initialization failed — push notifications will be skipped',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getMessaging(): Messaging | null {
    return this.messaging;
  }
}
