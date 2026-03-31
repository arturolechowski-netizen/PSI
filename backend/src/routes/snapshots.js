const express = require('express');
const { query, getClient } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/snapshots
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM snapshot_data sd WHERE sd.snapshot_id = s.id) as data_count
       FROM snapshots s LEFT JOIN users u ON s.created_by = u.id
       ORDER BY s.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/snapshots - create snapshot
router.post('/', authenticate, async (req, res, next) => {
  const client = await getClient();
  try {
    const { name, description } = req.body;
    const snapshotName = name || `Snapshot ${new Date().toISOString().split('T')[0]}`;

    await client.query('BEGIN');

    const { rows } = await client.query(
      'INSERT INTO snapshots (name, description, created_by, is_auto) VALUES ($1, $2, $3, $4) RETURNING *',
      [snapshotName, description || null, req.user.id, req.body.is_auto || false]
    );
    const snapshotId = rows[0].id;

    // Copy all current PSI data into snapshot
    await client.query(
      `INSERT INTO snapshot_data (snapshot_id, product_id, metric_type, year, week, value)
       SELECT $1, product_id, metric_type, year, week, value FROM psi_data`,
      [snapshotId]
    );

    await client.query('COMMIT');

    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/snapshots/compare
router.get('/compare', authenticate, async (req, res, next) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: 'Two snapshot IDs required (a, b)' });

    // Get deltas between snapshots
    const { rows } = await query(
      `SELECT
        COALESCE(sa.product_id, sb.product_id) as product_id,
        COALESCE(sa.metric_type, sb.metric_type) as metric_type,
        COALESCE(sa.year, sb.year) as year,
        COALESCE(sa.week, sb.week) as week,
        sa.value as value_a,
        sb.value as value_b,
        p.item_number, p.model
       FROM snapshot_data sa
       FULL OUTER JOIN snapshot_data sb
         ON sa.product_id = sb.product_id
         AND sa.metric_type = sb.metric_type
         AND sa.year = sb.year
         AND sa.week = sb.week
         AND sb.snapshot_id = $2
       LEFT JOIN products p ON COALESCE(sa.product_id, sb.product_id) = p.id
       WHERE sa.snapshot_id = $1
         AND (sa.value IS DISTINCT FROM sb.value)
       ORDER BY product_id, metric_type, year, week
       LIMIT 10000`,
      [a, b]
    );

    res.json({ snapshotA: parseInt(a), snapshotB: parseInt(b), deltas: rows });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/snapshots/:id
router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query('DELETE FROM snapshots WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Snapshot not found' });
    res.json({ message: 'Snapshot deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
