import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.userBinding.updateMany({
      data: {
        companyId: '70584647',
        internalCompanyId: '1'
      }
    });
    console.log(`Successfully updated ${result.count} users.`);
  } catch (e) {
    console.error('Update failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
