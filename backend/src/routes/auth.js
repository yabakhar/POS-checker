const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, username: admin.username, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/client/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  try {
    const result = await pool.query('SELECT * FROM clients WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const client = result.rows[0];
    if (!client.is_active) return res.status(403).json({ error: 'Account disabled.' });

    const valid = await bcrypt.compare(password, client.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: client.id, username: client.username, role: 'client' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, username: client.username, role: 'client', api_key: client.api_key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
