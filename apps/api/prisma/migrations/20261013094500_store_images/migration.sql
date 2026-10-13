-- CreateTable
CREATE TABLE "StoredImage" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buildingId" TEXT,
    "paymentRequestId" TEXT,

    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredImage_buildingId_key" ON "StoredImage"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredImage_paymentRequestId_key" ON "StoredImage"("paymentRequestId");

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
