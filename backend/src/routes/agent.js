const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyApiKey } = require('../middleware/apiKeyMiddleware');

router.post('/data', verifyApiKey, async (req, res) => {
  const data = req.body;
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No data provided.' });
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
