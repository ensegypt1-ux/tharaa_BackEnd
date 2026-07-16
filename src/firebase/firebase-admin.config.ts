import { ConfigService } from '@nestjs/config';
import { ServiceAccount } from 'firebase-admin/app';

/**
 * Normalizes PEM private keys from environment variables.
 * Supports literal newlines and escaped `\n` sequences (common in .env files).
 */
export function normalizeFcmPrivateKey(raw: string): string {
  let key = raw.trim();
  if (!key) {
    return '';
  }

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, '\n');
}

export type FcmCredentials = Pick<
  ServiceAccount,
  'projectId' | 'clientEmail' | 'privateKey'
>;

export function readFcmCredentialsFromConfig(
  config: ConfigService,
): FcmCredentials | null {
  const projectId = config.get<string>('fcm.projectId')?.trim() ?? '';
  const clientEmail = config.get<string>('fcm.clientEmail')?.trim() ?? '';
  const privateKey = normalizeFcmPrivateKey(
    config.get<string>('fcm.privateKey') ?? '',
  );

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

export function isFcmConfigured(config: ConfigService): boolean {
  return readFcmCredentialsFromConfig(config) !== null;
}
