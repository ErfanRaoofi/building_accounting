-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('NOTICE', 'BILL');

-- CreateEnum
CREATE TYPE "NoticeBillStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,0),
    "billStatus" "NoticeBillStatus",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "noticeId" TEXT;

-- AlterTable
ALTER TABLE "StoredImage" ADD COLUMN "noticeId" TEXT,
ADD COLUMN "paymentId" TEXT;

-- CreateIndex
CREATE INDEX "Notice_buildingId_fiscalYearId_date_idx" ON "Notice"("buildingId", "fiscalYearId", "date");

-- CreateIndex
CREATE INDEX "Notice_buildingId_kind_billStatus_idx" ON "Notice"("buildingId", "kind", "billStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_noticeId_key" ON "Payment"("noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredImage_noticeId_key" ON "StoredImage"("noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredImage_paymentId_key" ON "StoredImage"("paymentId");

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
