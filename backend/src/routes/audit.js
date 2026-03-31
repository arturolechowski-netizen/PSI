const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit
router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { product_id, user_id, start_date, end_date, metric_type, page, pageSize } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (product_id) { conditions.push(`a.product_id = $${idx++}`); values.push(product_id); }
    if (user_id) { conditions.push(`a.user_id = $${idx++}`); values.push(user_id); }
    if (start_date) { conditions.push(`a.created_at >= $${idx++}`); values.push(start_date); }
    if (end_date) { conditions.push(`a.created_at <= $${idx++}`); values.push(end_date); }
    if (metric_type) { conditions.push(`a.metric_type = $${idx++}`); values.push(metric_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = parseInt(pageSize) || 100;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_log a ${where}`, values
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await query(
      `SELECT a.*, u.name as user_name, p.item_number, p.model
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN products p ON a.product_id = p.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    res.json({ logs: rows, meta: { total, page: parseInt(page) || 1, pageSize: limit } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
