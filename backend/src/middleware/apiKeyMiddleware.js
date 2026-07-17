const pool = require('../config/db');

const verifyApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) return res.status(401).json({ error: 'API key required.' });

  try {
    const result = await pool.query(
      'SELECT id, username, is_active FROM clients WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid API key.' });

    const client = result.rows[0];
    if (!client.is_active) return res.status(403).json({ error: 'Account disabled.' });

    req.client = client;
    next();
  } catch (err) {
    console.error('API key error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = { verifyApiKey };
