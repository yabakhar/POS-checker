import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma';

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('Set ADMIN_PASSWORD in .env before running this script.');
    process.exit(1);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.admin.upsert({
      where: { username },
      update: { passwordHash },
      create: { username, passwordHash },
    });
    console.log(`Admin "${username}" created/updated successfully.`);
  } catch (err: any) {
    console.error('Error seeding admin:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
