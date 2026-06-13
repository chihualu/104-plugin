-- AlterTable
ALTER TABLE "UsageLog" ADD COLUMN     "actorUserId" INTEGER;

-- CreateTable
CREATE TABLE "Delegation" (
    "id" SERIAL NOT NULL,
    "granterId" INTEGER NOT NULL,
    "granteeId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Delegation_granteeId_active_idx" ON "Delegation"("granteeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_granterId_granteeId_key" ON "Delegation"("granterId", "granteeId");

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_granterId_fkey" FOREIGN KEY ("granterId") REFERENCES "UserBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "UserBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
