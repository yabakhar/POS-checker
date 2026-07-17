const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

const generateApiKey = () => uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');

router.get('/clients', verifyToken('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, api_key, is_active, created_at FROM clients ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/clients', verifyToken('admin'), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const existing = await pool.query('SELECT id FROM clients WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const apiKey = generateApiKey();

    const result = await pool.query(
      'INSERT INTO clients (username, password_hash, api_key) VALUES ($1, $2, $3) RETURNING id, username, api_key, is_active, created_at',
      [username, passwordHash, apiKey]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/reset-password', verifyToken('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'New password required.' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE clients SET password_hash = $1 WHERE id = $2 RETURNING id',
      [passwordHash, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/toggle', verifyToken('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE clients SET is_active = NOT is_active WHERE id = $1 RETURNING id, username, is_active',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/clients/:id/regenerate-key', verifyToken('admin'), async (req, res) => {
  try {
    const apiKey = generateApiKey();
    const result = await pool.query(
      'UPDATE clients SET api_key = $1 WHERE id = $2 RETURNING id, username, api_key',
      [apiKey, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
