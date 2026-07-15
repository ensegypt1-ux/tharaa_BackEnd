-- CreateEnum
CREATE TYPE "CampaignDestinationType" AS ENUM ('OFFER', 'CATEGORY', 'PRODUCT', 'COUPON', 'CART', 'NONE');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "subtitleAr" TEXT,
    "subtitleEn" TEXT,
    "imagePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "destinationType" "CampaignDestinationType" NOT NULL DEFAULT 'NONE',
    "destinationId" TEXT,
    "buttonLabelAr" TEXT,
    "buttonLabelEn" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_isActive_startsAt_endsAt_sortOrder_idx" ON "Campaign"("isActive", "startsAt", "endsAt", "sortOrder");

-- CreateIndex
CREATE INDEX "Campaign_sortOrder_idx" ON "Campaign"("sortOrder");
