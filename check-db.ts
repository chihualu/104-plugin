import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.userBinding.findMany();
    console.log('--- UserBinding Table Data ---');
    if (users.length === 0) {
      console.log('No records found.');
    } else {
      console.table(users);
    }
  } catch (e) {
    console.error('Error querying database:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
