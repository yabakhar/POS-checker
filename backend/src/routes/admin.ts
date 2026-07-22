import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { verifyToken } from '../middleware/authMiddleware';
import { validateBody } from '../validation/validate';
import { createClientSchema, CreateClientInput, resetPasswordSchema, ResetPasswordInput } from '../validation/schemas';

const router = express.Router();

const generateApiKey = () => uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');

const CLIENT_SUMMARY_SELECT = { id: true, username: true, apiKey: true, isActive: true, createdAt: true } as const;

interface ClientSummary {
  id: string;
  username: string;
  apiKey?: string;
  isActive?: boolean | null;
  createdAt?: Date | null;
}

// Keeps the JSON wire format (snake_case) stable for the frontend regardless of Prisma's
// camelCase model fields.
const toClientJson = (c: ClientSummary) => ({
  id: c.id,
  username: c.username,
  ...(c.apiKey !== undefined && { api_key: c.apiKey }),
  ...(c.isActive !== undefined && { is_active: c.isActive }),
  ...(c.createdAt !== undefined && { created_at: c.createdAt }),
});

router.get('/clients', verifyToken('admin'), async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      select: CLIENT_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json(clients.map(toClientJson));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/clients', verifyToken('admin'), validateBody(createClientSchema), async (req: Request<{}, {}, CreateClientInput>, res: Response) => {
  const { username, password } = req.body;

  try {
    const existing = await prisma.client.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: 'Username already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const apiKey = generateApiKey();

    const client = await prisma.client.create({
      data: { username, passwordHash, apiKey },
      select: CLIENT_SUMMARY_SELECT,
    });

    res.status(201).json(toClientJson(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/reset-password', verifyToken('admin'), validateBody(resetPasswordSchema), async (req: Request<{ id: string }, {}, ResetPasswordInput>, res: Response) => {
  const { password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.client.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ message: 'Password reset successfully.' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found.' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/toggle', verifyToken('admin'), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const current = await prisma.client.findUnique({ where: { id: req.params.id }, select: { isActive: true } });
    if (!current) return res.status(404).json({ error: 'Client not found.' });

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { isActive: !current.isActive },
      select: { id: true, username: true, isActive: true },
    });
    res.json(toClientJson(client));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/regenerate-key', verifyToken('admin'), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const apiKey = generateApiKey();
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { apiKey },
      select: { id: true, username: true, apiKey: true },
    });
    res.json(toClientJson(client));
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Client not found.' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
