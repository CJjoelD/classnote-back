const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to DB...");
  const devices = await prisma.device.findMany({
    include: {
      user: true
    }
  });
  console.log("Registered Devices:", JSON.stringify(devices, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
