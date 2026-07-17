const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/dashboard', verifyToken('client'), async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    const [data, count] = await Promise.all([
      pool.query(
        'SELECT id, data, received_at FROM pos_data WHERE client_id = $1 ORDER BY received_at DESC LIMIT $2 OFFSET $3',
        [req.user.id, limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM pos_data WHERE client_id = $1', [req.user.id]),
    ]);

    res.json({
      data: data.rows,
      total: parseInt(count.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/stats', verifyToken('client'), async (req, res) => {
  try {
    const [total, today, last] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pos_data WHERE client_id = $1', [req.user.id]),
      pool.query('SELECT COUNT(*) FROM pos_data WHERE client_id = $1 AND received_at >= CURRENT_DATE', [req.user.id]),
      pool.query('SELECT received_at FROM pos_data WHERE client_id = $1 ORDER BY received_at DESC LIMIT 1', [req.user.id]),
    ]);

    res.json({
      total_records: parseInt(total.rows[0].count),
      today_records: parseInt(today.rows[0].count),
      last_sync: last.rows[0]?.received_at || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
