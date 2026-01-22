-- CreateTable
CREATE TABLE "UserBinding" (
    "id" SERIAL NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "companyId" TEXT,
    "empId" TEXT,
    "encryptedToken" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBinding_lineUserId_key" ON "UserBinding"("lineUserId");

-- CreateIndex
CREATE INDEX "UserBinding_lineUserId_idx" ON "UserBinding"("lineUserId");
