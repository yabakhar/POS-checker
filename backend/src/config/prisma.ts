import { PrismaClient } from '../../generated/prisma';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// `tsx watch` restarts the process on every file change, so a fresh PrismaClient (and its own
// connection pool) would otherwise get created on every hot reload in dev — stash it on
// `global` so reloads reuse the same instance instead of leaking connections.
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

export default prisma;
