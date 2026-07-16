import { normalizeFcmPrivateKey } from '../firebase/firebase-admin.config';

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
  },
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  storage: {
    root: process.env.STORAGE_ROOT || './storage',
    publicBaseUrl:
      process.env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:3000/static',
    maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || '5242880', 10),
    allowedMimes: (
      process.env.ALLOWED_IMAGE_MIMES || 'image/jpeg,image/png,image/webp'
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    privateKey: normalizeFcmPrivateKey(process.env.FCM_PRIVATE_KEY || ''),
  },
  corsOrigins: [
    ...(process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    ...(process.env.ADMIN_DASHBOARD_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ].filter((origin, index, all) => all.indexOf(origin) === index),
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
  defaultCity: process.env.DEFAULT_CITY || 'Al Khafji',
  defaultLocale: process.env.DEFAULT_LOCALE || 'ar',
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || '',
    phone: process.env.SEED_ADMIN_PHONE || '',
    password: process.env.SEED_ADMIN_PASSWORD || '',
    name: process.env.SEED_ADMIN_NAME || 'Tharaa Admin',
  },
  pexels: {
    apiKey: process.env.PEXELS_API_KEY || '',
  },
});
