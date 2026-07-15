-- AlterEnum
CREATE TYPE "ReviewReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "ProductReview" ADD COLUMN "replyText" TEXT,
ADD COLUMN "replyByUserId" TEXT,
ADD COLUMN "repliedAt" TIMESTAMP(3),
ADD COLUMN "moderatedAt" TIMESTAMP(3),
ADD COLUMN "moderatedById" TEXT;

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductReview_userId_deletedAt_idx" ON "ProductReview"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProductReview_createdAt_idx" ON "ProductReview"("createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_status_createdAt_idx" ON "ReviewReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReport_reviewId_reporterId_key" ON "ReviewReport"("reviewId", "reporterId");

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_replyByUserId_fkey" FOREIGN KEY ("replyByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
