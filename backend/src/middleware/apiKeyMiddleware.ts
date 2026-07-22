import { Request, Response, NextFunction, RequestHandler } from 'express';
import prisma from '../config/prisma';

export const verifyApiKey: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'API key required.' });

  try {
    const client = await prisma.client.findUnique({
      where: { apiKey },
      select: { id: true, username: true, isActive: true },
    });

    if (!client) return res.status(401).json({ error: 'Invalid API key.' });
    if (!client.isActive) return res.status(403).json({ error: 'Account disabled.' });

    req.client = client;
    next();
  } catch (err) {
    console.error('API key error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};
