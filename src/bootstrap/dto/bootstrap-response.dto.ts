import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BootstrapApplicationDto {
  @ApiProperty({ example: 'Tharaa Market' })
  appName: string;

  @ApiProperty({ example: 'development' })
  environment: string;

  @ApiProperty({ example: '1.0.0' })
  apiVersion: string;

  @ApiProperty({ example: false })
  maintenanceMode: boolean;

  @ApiProperty({ example: '1.0.0' })
  minimumSupportedVersion: string;

  @ApiProperty({ example: '1.0.0' })
  latestVersion: string;

  @ApiProperty({ example: false })
  forceUpdate: boolean;
}

export class BootstrapLocalizationDto {
  @ApiProperty({ example: 'ar' })
  defaultLanguage: string;

  @ApiProperty({ example: ['ar', 'en'] })
  supportedLanguages: string[];
}

export class BootstrapStoreDto {
  @ApiProperty({ example: 'ثراء ماركت' })
  storeNameAr: string;

  @ApiProperty({ example: 'Tharaa Market' })
  storeNameEn: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  storeLogo: string | null;

  @ApiProperty({ example: '+966500000000' })
  supportPhone: string;

  @ApiProperty({ example: 'support@tharaa.market' })
  supportEmail: string;
}

export class BootstrapDeliveryDto {
  @ApiProperty()
  deliveryEnabled: boolean;

  @ApiProperty()
  pickupEnabled: boolean;

  @ApiProperty({ example: 15 })
  deliveryFee: number;

  @ApiProperty({ example: 150 })
  freeDeliveryThreshold: number;

  @ApiProperty({ example: 20 })
  minimumDeliveryOrder: number;

  @ApiProperty({ example: 15 })
  minimumPickupOrder: number;

  @ApiProperty({
    example: { min: 30, max: 45 },
  })
  estimatedDeliveryMinutes: { min: number; max: number };

  @ApiProperty({
    example: { min: 20, max: 35 },
  })
  estimatedPickupMinutes: { min: number; max: number };

  @ApiProperty({ example: 'Al Khafji' })
  serviceCity: string;
}

export class BootstrapPickupDto {
  @ApiProperty()
  storeNameAr: string;

  @ApiProperty()
  storeNameEn: string;

  @ApiProperty()
  storeAddressAr: string;

  @ApiProperty()
  storeAddressEn: string;

  @ApiProperty({ example: 28.4398 })
  latitude: number;

  @ApiProperty({ example: 48.484 })
  longitude: number;

  @ApiProperty({
    example: {
      sunday: { open: '09:00', close: '23:00' },
    },
  })
  workingHours: Record<string, unknown>;
}

export class BootstrapPaymentDto {
  @ApiProperty({ example: ['CASH_ON_DELIVERY'] })
  supportedPaymentMethods: string[];
}

export class BootstrapFulfilmentDto {
  @ApiProperty({ example: ['DELIVERY', 'PICKUP'] })
  supportedFulfilmentTypes: string[];
}

export class BootstrapAuthenticationDto {
  @ApiProperty({ example: false })
  googleLoginEnabled: boolean;
}

export class BootstrapNotificationsDto {
  @ApiProperty({ example: true })
  notificationsEnabled: boolean;
}

export class BootstrapFeatureFlagsDto {
  @ApiProperty()
  reviewsEnabled: boolean;

  @ApiProperty()
  couponsEnabled: boolean;

  @ApiProperty()
  offersEnabled: boolean;

  @ApiProperty()
  inventoryEnabled: boolean;

  @ApiProperty()
  searchEnabled: boolean;
}

export class BootstrapResponseDto {
  @ApiProperty({ type: BootstrapApplicationDto })
  application: BootstrapApplicationDto;

  @ApiProperty({ type: BootstrapLocalizationDto })
  localization: BootstrapLocalizationDto;

  @ApiProperty({ type: BootstrapStoreDto })
  store: BootstrapStoreDto;

  @ApiProperty({ type: BootstrapDeliveryDto })
  delivery: BootstrapDeliveryDto;

  @ApiProperty({ type: BootstrapPickupDto })
  pickup: BootstrapPickupDto;

  @ApiProperty({ type: BootstrapPaymentDto })
  payment: BootstrapPaymentDto;

  @ApiProperty({ type: BootstrapFulfilmentDto })
  fulfilment: BootstrapFulfilmentDto;

  @ApiProperty({ type: BootstrapAuthenticationDto })
  authentication: BootstrapAuthenticationDto;

  @ApiProperty({ type: BootstrapNotificationsDto })
  notifications: BootstrapNotificationsDto;

  @ApiProperty({ type: BootstrapFeatureFlagsDto })
  featureFlags: BootstrapFeatureFlagsDto;
}
