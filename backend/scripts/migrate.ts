import 'dotenv/config';
import { execFileSync } from 'child_process';
import path from 'path';

// Thin wrapper so `make db-init` / `npm run db:migrate` keep working after the move to
// Prisma Migrate — the actual migration files now live in backend/prisma/migrations.
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});
