-- DropIndex
DROP INDEX "UserBinding_lineUserId_idx";

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTask_scheduledAt_status_idx" ON "ScheduledTask"("scheduledAt", "status");

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
