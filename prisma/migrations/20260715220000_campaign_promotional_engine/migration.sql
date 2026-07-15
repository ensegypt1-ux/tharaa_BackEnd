-- Extend destination enum (PostgreSQL 12+: allowed in transaction if values unused later in same tx)
ALTER TYPE "CampaignDestinationType" ADD VALUE 'CHECKOUT';
ALTER TYPE "CampaignDestinationType" ADD VALUE 'ORDERS';
ALTER TYPE "CampaignDestinationType" ADD VALUE 'SEARCH';
ALTER TYPE "CampaignDestinationType" ADD VALUE 'EXTERNAL_URL';
ALTER TYPE "CampaignDestinationType" ADD VALUE 'INTERNAL_ROUTE';

CREATE TYPE "CampaignPlacement" AS ENUM (
  'HOME_HERO',
  'HOME_SLIDER',
  'HOME_STRIP',
  'HOME_CATEGORY_STRIP',
  'HOME_MIDDLE',
  'HOME_BOTTOM',
  'CATEGORY_TOP',
  'CATEGORY_INLINE',
  'PRODUCT_TOP',
  'PRODUCT_AFTER_IMAGES',
  'PRODUCT_BEFORE_DESCRIPTION',
  'PRODUCT_BOTTOM',
  'OFFERS_TOP',
  'SEARCH_TOP',
  'CART_TOP',
  'CART_BOTTOM',
  'CHECKOUT_TOP',
  'CHECKOUT_BOTTOM',
  'ORDER_SUCCESS'
);

CREATE TYPE "CampaignLayout" AS ENUM (
  'HERO_BANNER',
  'SMALL_BANNER',
  'STRIP_BANNER',
  'SQUARE_CARD',
  'POPUP',
  'COUPON_CARD',
  'FLOATING_BANNER',
  'FLASH_SALE_CARD'
);

CREATE TYPE "CampaignAudience" AS ENUM ('ALL', 'GUEST_ONLY', 'LOGGED_IN_ONLY');

CREATE TYPE "CampaignFrequency" AS ENUM (
  'ALWAYS',
  'ONCE',
  'DAILY',
  'EVERY_LAUNCH',
  'EVERY_SESSION',
  'DISMISS_HOURS'
);

CREATE TYPE "CampaignRotationMode" AS ENUM ('PRIORITY', 'WEIGHT', 'RANDOM');

CREATE TYPE "CampaignCtaStyle" AS ENUM ('PRIMARY', 'SECONDARY', 'OUTLINE', 'TEXT', 'PILL');

CREATE TYPE "CampaignTextAlign" AS ENUM ('START', 'CENTER', 'END');

CREATE TYPE "CampaignEventType" AS ENUM ('IMPRESSION', 'CLICK');

ALTER TABLE "Campaign"
ADD COLUMN "iconPath" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rotationMode" "CampaignRotationMode" NOT NULL DEFAULT 'PRIORITY',
ADD COLUMN "maxImpressions" INTEGER,
ADD COLUMN "maxClicks" INTEGER,
ADD COLUMN "layout" "CampaignLayout" NOT NULL DEFAULT 'HERO_BANNER',
ADD COLUMN "audience" "CampaignAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN "frequency" "CampaignFrequency" NOT NULL DEFAULT 'ALWAYS',
ADD COLUMN "dismissHours" INTEGER,
ADD COLUMN "targetCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetBranchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetOfferIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "targetCouponIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "minCartAmount" DECIMAL(12,2),
ADD COLUMN "maxCartAmount" DECIMAL(12,2),
ADD COLUMN "backgroundColor" TEXT,
ADD COLUMN "gradientFrom" TEXT,
ADD COLUMN "gradientTo" TEXT,
ADD COLUMN "badgeTextAr" TEXT,
ADD COLUMN "badgeTextEn" TEXT,
ADD COLUMN "discountBadgeAr" TEXT,
ADD COLUMN "discountBadgeEn" TEXT,
ADD COLUMN "ctaStyle" "CampaignCtaStyle" NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN "textAlign" "CampaignTextAlign" NOT NULL DEFAULT 'START',
ADD COLUMN "overlayOpacity" DOUBLE PRECISION DEFAULT 0.35,
ADD COLUMN "cornerRadius" INTEGER DEFAULT 16,
ADD COLUMN "destinationUrl" TEXT,
ADD COLUMN "destinationRoute" TEXT,
ADD COLUMN "autoApplyCoupon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "impressionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastViewedAt" TIMESTAMP(3),
ADD COLUMN "lastClickedAt" TIMESTAMP(3);

UPDATE "Campaign" SET "priority" = GREATEST(0, 1000 - "sortOrder");

CREATE INDEX "Campaign_priority_idx" ON "Campaign"("priority");
CREATE INDEX "Campaign_layout_idx" ON "Campaign"("layout");

CREATE TABLE "CampaignPlacementAssignment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placement" "CampaignPlacement" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPlacementAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignPlacementAssignment_campaignId_placement_key"
  ON "CampaignPlacementAssignment"("campaignId", "placement");

CREATE INDEX "CampaignPlacementAssignment_placement_idx"
  ON "CampaignPlacementAssignment"("placement");

ALTER TABLE "CampaignPlacementAssignment"
  ADD CONSTRAINT "CampaignPlacementAssignment_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy home carousel campaigns map to HOME_SLIDER
INSERT INTO "CampaignPlacementAssignment" ("id", "campaignId", "placement", "createdAt")
SELECT
  md5(c."id" || ':HOME_SLIDER'),
  c."id",
  'HOME_SLIDER'::"CampaignPlacement",
  CURRENT_TIMESTAMP
FROM "Campaign" c
WHERE c."deletedAt" IS NULL;

CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CampaignEventType" NOT NULL,
    "placement" "CampaignPlacement",
    "userId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignEvent_campaignId_type_createdAt_idx"
  ON "CampaignEvent"("campaignId", "type", "createdAt");

CREATE INDEX "CampaignEvent_createdAt_idx" ON "CampaignEvent"("createdAt");

ALTER TABLE "CampaignEvent"
  ADD CONSTRAINT "CampaignEvent_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
