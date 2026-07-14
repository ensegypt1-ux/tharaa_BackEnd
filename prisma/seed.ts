import { PrismaClient, UserRole, Locale, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  importProductsFromExcel,
  logProductsExcelImportSummary,
} from './importers/products-excel.importer';

const prisma = new PrismaClient();

async function upsertSetting(key: string, value: Prisma.InputJsonValue) {
  await prisma.appSettings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const phone = process.env.SEED_ADMIN_PHONE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Tharaa Admin';
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!email || !phone || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, and SEED_ADMIN_PASSWORD must be set in the environment before seeding',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      phone,
      fullName: name,
      passwordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      locale: Locale.ar,
      deletedAt: null,
    },
    create: {
      email,
      phone,
      fullName: name,
      passwordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      locale: Locale.ar,
    },
  });

  const deliveryCount = await prisma.deliverySettings.count();
  if (deliveryCount === 0) {
    await prisma.deliverySettings.create({
      data: {
        isEnabled: true,
        fee: 15,
        freeDeliveryThreshold: 150,
        minOrderAmount: 20,
        estimatedMinutesMin: 30,
        estimatedMinutesMax: 45,
        serviceCity: 'Al Khafji',
      },
    });
  }

  const pickupCount = await prisma.pickupSettings.count();
  if (pickupCount === 0) {
    await prisma.pickupSettings.create({
      data: {
        isEnabled: true,
        minOrderAmount: 15,
        estimatedMinutesMin: 20,
        estimatedMinutesMax: 35,
        storeNameAr: 'ثراء ماركت — الخفجي',
        storeNameEn: 'Tharaa Market — Al Khafji',
        addressAr: 'الخفجي، المنطقة الشرقية، المملكة العربية السعودية',
        addressEn: 'Al Khafji, Eastern Province, Saudi Arabia',
        latitude: 28.4398,
        longitude: 48.484,
        workingHoursJson: {
          sunday: { open: '09:00', close: '23:00' },
          monday: { open: '09:00', close: '23:00' },
          tuesday: { open: '09:00', close: '23:00' },
          wednesday: { open: '09:00', close: '23:00' },
          thursday: { open: '09:00', close: '23:00' },
          friday: { open: '14:00', close: '23:00' },
          saturday: { open: '09:00', close: '23:00' },
        },
      },
    });
  }

  await upsertSetting('serviceCity', {
    city: 'Al Khafji',
    cityAr: 'الخفجي',
  });

  await upsertSetting('app', {
    nameAr: 'ثراء ماركت',
    nameEn: 'Tharaa Market',
    defaultLocale: 'ar',
    currency: 'SAR',
    supportPhone: '+966500000000',
    supportEmail: 'support@tharaa.market',
  });

  // Bootstrap AppSettings (read by GET /api/v1/bootstrap — not hardcoded in controllers)
  await upsertSetting('bootstrap.application', {
    appName: 'Tharaa Market',
    environment: nodeEnv,
    apiVersion: '1.0.0',
    maintenanceMode: false,
    minimumSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
  });

  await upsertSetting('bootstrap.localization', {
    defaultLanguage: 'ar',
    supportedLanguages: ['ar', 'en'],
  });

  await upsertSetting('bootstrap.store', {
    storeNameAr: 'ثراء ماركت',
    storeNameEn: 'Tharaa Market',
    storeLogo: null,
    supportPhone: '+966500000000',
    supportEmail: 'support@tharaa.market',
  });

  await upsertSetting('bootstrap.payment', {
    supportedPaymentMethods: ['CASH_ON_DELIVERY'],
  });

  await upsertSetting('bootstrap.fulfilment', {
    supportedFulfilmentTypes: ['DELIVERY', 'PICKUP'],
  });

  await upsertSetting('bootstrap.authentication', {
    // Enabled only when GOOGLE_CLIENT_IDS is also configured at runtime
    googleLoginEnabled: Boolean(
      (process.env.GOOGLE_CLIENT_IDS || '').trim().length > 0,
    ),
  });

  await upsertSetting('bootstrap.notifications', {
    notificationsEnabled: true,
  });

  await upsertSetting('bootstrap.featureFlags', {
    reviewsEnabled: true,
    couponsEnabled: true,
    offersEnabled: true,
    inventoryEnabled: true,
    searchEnabled: true,
  });

  let category = await prisma.category.findFirst({
    where: { nameEn: 'Vegetables', deletedAt: null },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        nameAr: 'خضروات',
        nameEn: 'Vegetables',
        sortOrder: 1,
        isActive: true,
      },
    });
  }

  let product = await prisma.product.findFirst({
    where: { sku: 'TH-TOM-001', deletedAt: null },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        categoryId: category.id,
        nameAr: 'طماطم طازجة',
        nameEn: 'Fresh Tomatoes',
        descriptionAr: 'طماطم طازجة من السوق المحلي',
        descriptionEn: 'Fresh local tomatoes',
        sku: 'TH-TOM-001',
        unit: '1kg',
        hasVariants: false,
        regularPrice: 8.5,
        salePrice: 7.5,
        isActive: true,
        isFeatured: true,
        inventory: {
          create: {
            quantity: 100,
            reservedQuantity: 0,
          },
        },
      },
    });
  }

  let coupon = await prisma.coupon.findUnique({ where: { code: 'THARAA10' } });
  if (!coupon) {
    const now = new Date();
    const yearLater = new Date(now);
    yearLater.setFullYear(yearLater.getFullYear() + 1);
    coupon = await prisma.coupon.create({
      data: {
        code: 'THARAA10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 50,
        maxDiscountAmount: 30,
        usageLimit: 1000,
        perUserLimit: 5,
        startsAt: now,
        expiresAt: yearLater,
        applicability: 'ALL',
        isActive: true,
      },
    });
  }

  // Excel catalog import (idempotent; only mutates XLS-* SKUs)
  const excelSummary = await importProductsFromExcel(prisma);
  logProductsExcelImportSummary(excelSummary);

  console.log('Seed completed:');
  console.log(`  ADMIN email: ${email}`);
  console.log(`  Coupon: THARAA10`);
  console.log(`  Demo product SKU: TH-TOM-001`);
  console.log('  Bootstrap AppSettings keys seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
