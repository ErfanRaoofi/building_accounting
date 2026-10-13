-- CreateTable
CREATE TABLE "PurchaseInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "buildingName" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planLabel" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseInquiry_createdAt_idx" ON "PurchaseInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseInquiry_planId_idx" ON "PurchaseInquiry"("planId");
