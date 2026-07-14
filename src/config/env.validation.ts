import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().required(),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  API_PREFIX: Joi.string().default('api/v1'),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES: Joi.string().default('30d'),

  GOOGLE_CLIENT_IDS: Joi.string().allow('').default(''),

  STORAGE_ROOT: Joi.string().default('./storage'),
  STORAGE_PUBLIC_BASE_URL: Joi.string().default('http://localhost:3000/static'),
  MAX_UPLOAD_BYTES: Joi.number().integer().positive().default(5242880),
  ALLOWED_IMAGE_MIMES: Joi.string().default('image/jpeg,image/png,image/webp'),

  FCM_PROJECT_ID: Joi.string().allow('').default(''),
  FCM_CLIENT_EMAIL: Joi.string().allow('').default(''),
  FCM_PRIVATE_KEY: Joi.string().allow('').default(''),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  ADMIN_DASHBOARD_ORIGINS: Joi.string().allow('').default(''),
  THROTTLE_TTL: Joi.number().integer().positive().default(60),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),

  DEFAULT_CITY: Joi.string().default('Al Khafji'),
  DEFAULT_LOCALE: Joi.string().valid('ar', 'en').default('ar'),

  SEED_ADMIN_EMAIL: Joi.string().email().allow('').default(''),
  SEED_ADMIN_PHONE: Joi.string().allow('').default(''),
  SEED_ADMIN_PASSWORD: Joi.string().allow('').default(''),
  SEED_ADMIN_NAME: Joi.string().allow('').default('Tharaa Admin'),

  POSTGRES_USER: Joi.string().allow('').default(''),
  POSTGRES_PASSWORD: Joi.string().allow('').default(''),
  POSTGRES_DB: Joi.string().allow('').default(''),
  POSTGRES_PORT: Joi.number().port().optional(),
  REDIS_PORT: Joi.number().port().optional(),

  PEXELS_API_KEY: Joi.string().allow('').default(''),
});
