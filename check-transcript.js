const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to DB...");
  const latestClass = await prisma.class.findFirst({
    orderBy: {
      createdAt: 'desc'
    }
  });
  console.log("Latest Class Record:", JSON.stringify(latestClass, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
