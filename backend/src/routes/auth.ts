import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { validateBody } from '../validation/validate';
import { loginSchema, LoginInput } from '../validation/schemas';

const router = express.Router();

router.post('/admin/login', validateBody(loginSchema), async (req: Request<{}, {}, LoginInput>, res: Response) => {
  const { username, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    res.json({ token, username: admin.username, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/client/login', validateBody(loginSchema), async (req: Request<{}, {}, LoginInput>, res: Response) => {
  const { username, password } = req.body;

  try {
    const client = await prisma.client.findUnique({ where: { username } });
    if (!client) return res.status(401).json({ error: 'Invalid credentials.' });
    if (!client.isActive) return res.status(403).json({ error: 'Account disabled.' });

    const valid = await bcrypt.compare(password, client.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: client.id, username: client.username, role: 'client' },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    res.json({ token, username: client.username, role: 'client', api_key: client.apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
