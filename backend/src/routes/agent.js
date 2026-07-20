const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyApiKey } = require('../middleware/apiKeyMiddleware');

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

router.post('/data', verifyApiKey, async (req, res) => {
  const data = req.body;
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No data provided.' });
  }

  if (IGNORED_TYPES.includes(data.type)) {
    return res.json({ success: true, ignored: true, received_at: new Date().toISOString() });
  }

  try {
    await pool.query(
      'INSERT INTO pos_data (client_id, data) VALUES ($1, $2)',
      [req.client.id, JSON.stringify(data)]
    );
    res.json({ success: true, received_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/ping', verifyApiKey, (req, res) => {
  res.json({ success: true, client: req.client.username, timestamp: new Date().toISOString() });
});

module.exports = router;
