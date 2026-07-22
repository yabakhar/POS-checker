import 'dotenv/config';
import prisma from '../src/config/prisma';

// Wipes all client/admin/synced-data rows for a clean end-to-end test run.
async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "pos_data", "clients", "admins" RESTART IDENTITY CASCADE');
  console.log('clients, pos_data et admins vidés. Relance "npm run db:seed-admin" pour recréer le compte admin.');
}

resetDb()
  .catch((err) => {
    console.error('Echec du reset :', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
