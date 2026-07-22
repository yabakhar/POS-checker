import express, { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import prisma from '../config/prisma';
import { verifyApiKey } from '../middleware/apiKeyMiddleware';
import { validateBody } from '../validation/validate';
import { agentDataSchema, AgentDataInput } from '../validation/schemas';

const router = express.Router();

// Tables never accepted, even if an agent's config still sends them
// (too large / not relevant to collect).
const IGNORED_TYPES = [
  'table_sync:tbl_occupation',
  'table_sync:tbl_langue_description',
  'table_sync:test_1',
  'table_sync:test_0',
  'table_sync:tbl_type_glory',
  'table_sync:tbl_type_article',
  'table_sync:tbl_type_reglement',
  'table_sync:tbl_parameters',
  'table_sync:tbl_clavier_fonction',
  'table_sync:tbl_fonctionnalites',
];

router.post('/data', verifyApiKey, validateBody(agentDataSchema), async (req: Request<{}, {}, AgentDataInput>, res: Response) => {
  const data = req.body;

  if (IGNORED_TYPES.includes(data.type)) {
    return res.json({ success: true, ignored: true, received_at: new Date().toISOString() });
  }

  try {
    await prisma.posData.create({
      data: { clientId: req.client!.id, data: data as Prisma.InputJsonValue },
    });
    res.json({ success: true, received_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/ping', verifyApiKey, (req: Request, res: Response) => {
  res.json({ success: true, client: req.client!.username, timestamp: new Date().toISOString() });
});

export default router;
