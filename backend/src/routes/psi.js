const express = require('express');
const { query, getClient } = require('../db');
const { authenticate } = require('../middleware/auth');
const { recalculateProduct, METRIC_TYPES } = require('../services/formulaEngine');

const router = express.Router();

// GET /api/psi/weeks - get the week axis configuration
router.get('/weeks', authenticate, async (req, res) => {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Generate ISO weeks: last 4 weeks of prev year + all weeks of current year
  const weeks = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Helper: get ISO week number and year for a date
  function getISOWeekData(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { week: weekNo, year: d.getUTCFullYear() };
  }

  // Get current ISO week
  const currentISOData = getISOWeekData(now);

  // Get the Monday of ISO week 49 of previous year as start
  function getMondayOfISOWeek(week, year) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    return monday;
  }

  // Start from week 49 of previous year (gives ~4 weeks before year start)
  const startWeek = 49;
  const startYear = currentYear - 1;
  let date = getMondayOfISOWeek(startWeek, startYear);

  let currentWeekIndex = 0;
  const seen = new Set();

  for (let i = 0; i < 57; i++) {
    const isoData = getISOWeekData(date);
    const key = `${isoData.year}_${isoData.week}`;
    if (seen.has(key)) {
      date.setUTCDate(date.getUTCDate() + 7);
      continue;
    }
    seen.add(key);

    const isPast = isoData.year < currentISOData.year ||
      (isoData.year === currentISOData.year && isoData.week < currentISOData.week);
    const isCurrent = isoData.year === currentISOData.year && isoData.week === currentISOData.week;

    if (isCurrent) currentWeekIndex = weeks.length;

    weeks.push({
      year: isoData.year,
      week: isoData.week,
      month: date.getUTCMonth() + 1,
      monthName: monthNames[date.getUTCMonth()],
      key: key,
      isPast,
      isCurrent,
    });

    date.setUTCDate(date.getUTCDate() + 7);
  }

  res.json({ weeks, currentWeekIndex });
});

// POST /api/psi/batch - get PSI data for multiple products
router.post('/batch', authenticate, async (req, res, next) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await query(
      `SELECT product_id, metric_type, year, week, value
       FROM psi_data WHERE product_id IN (${placeholders})
       ORDER BY product_id, metric_type, year, week`,
      productIds
    );

    // Reshape: { productId: { metric: { year_week: value } } }
    const result = {};
    for (const row of rows) {
      if (!result[row.product_id]) result[row.product_id] = {};
      if (!result[row.product_id][row.metric_type]) result[row.product_id][row.metric_type] = {};
      result[row.product_id][row.metric_type][`${row.year}_${row.week}`] = parseFloat(row.value);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/psi/:productId - update a single cell and recalculate
router.patch('/:productId', authenticate, async (req, res, next) => {
  const client = await getClient();
  try {
    const { productId } = req.params;
    const { metric, year, week, value } = req.body;

    if (!metric || !year || !week || value === undefined) {
      return res.status(400).json({ error: 'metric, year, week, and value are required' });
    }

    await client.query('BEGIN');

    // Log audit
    const existing = await client.query(
      'SELECT value FROM psi_data WHERE product_id=$1 AND metric_type=$2 AND year=$3 AND week=$4',
      [productId, metric, year, week]
    );
    const oldValue = existing.rows.length ? existing.rows[0].value : null;

    // Upsert the value
    await client.query(
      `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6,NOW())
       ON CONFLICT (product_id, metric_type, year, week)
       DO UPDATE SET value=$5, is_manual=TRUE, updated_by=$6, updated_at=NOW()`,
      [productId, metric, year, week, value, req.user.id]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (user_id, product_id, metric_type, year, week, old_value, new_value, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'update')`,
      [req.user.id, productId, metric, year, week, oldValue, value]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/psi/batch-update - update multiple cells
router.post('/batch-update', authenticate, async (req, res, next) => {
  const client = await getClient();
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array required' });
    }

    await client.query('BEGIN');

    for (const u of updates) {
      const [year, week] = u.yearWeek ? u.yearWeek.split('_') : [u.year, u.week];
      await client.query(
        `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (product_id, metric_type, year, week)
         DO UPDATE SET value=$5, is_manual=$6, updated_by=$7, updated_at=NOW()`,
        [u.productId || u.product_id, u.metric || u.metric_type, parseInt(year), parseInt(week),
          u.value, u.is_manual !== undefined ? u.is_manual : false, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, count: updates.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/psi/recalculate - recalculate derived metrics for products
router.post('/recalculate', authenticate, async (req, res, next) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: 'productIds array required' });
    }

    // For each product, load all data, recalculate, and save calculated metrics
    for (const pid of productIds) {
      const product = await query('SELECT moq FROM products WHERE id = $1', [pid]);
      const moq = product.rows.length ? product.rows[0].moq : 1;

      const { rows } = await query(
        'SELECT metric_type, year, week, value FROM psi_data WHERE product_id = $1 ORDER BY year, week',
        [pid]
      );

      // Build week data array
      const weekMap = {};
      for (const r of rows) {
        const key = `${r.year}_${r.week}`;
        if (!weekMap[key]) weekMap[key] = { year: r.year, week: r.week };
        weekMap[key][r.metric_type] = parseFloat(r.value);
      }

      const weekData = Object.values(weekMap).sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.week - b.week
      );

      if (weekData.length === 0) continue;

      // Find current week index
      const now = new Date();
      const currentISO = getISOWeekNumber(now);
      let currentIdx = weekData.findIndex(w => w.year === currentISO.year && w.week === currentISO.week);
      if (currentIdx === -1) currentIdx = 0;

      const recalculated = recalculateProduct(weekData, currentIdx, moq, 4);

      // Save calculated metrics back
      const calculatedMetrics = ['availability', 'demand', 'inventory_client', 'stock_days_terg', 'stock_days_ttl'];
      const client = await getClient();
      try {
        await client.query('BEGIN');
        for (let i = currentIdx; i < recalculated.length; i++) {
          const w = recalculated[i];
          for (const m of calculatedMetrics) {
            const val = w[m] === 'no sales' ? null : w[m];
            await client.query(
              `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_at)
               VALUES ($1,$2,$3,$4,$5,FALSE,NOW())
               ON CONFLICT (product_id, metric_type, year, week)
               DO UPDATE SET value=$5, updated_at=NOW()`,
              [pid, m, w.year, w.week, val]
            );
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

module.exports = router;
