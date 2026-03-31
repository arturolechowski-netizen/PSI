const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function getCurrentISOWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

// GET /api/dashboard/stock-days-heatmap
router.get('/stock-days-heatmap', authenticate, async (req, res, next) => {
  try {
    const { year: currentYear, week: currentWeek } = getCurrentISOWeek();
    const { brand, category_1 } = req.query;

    let productFilter = '';
    const params = [currentYear];
    let idx = 2;

    if (brand) { productFilter += ` AND p.brand = $${idx++}`; params.push(brand); }
    if (category_1) { productFilter += ` AND p.category_1 = $${idx++}`; params.push(category_1); }

    const { rows } = await query(
      `SELECT p.id, p.item_number, p.model, p.brand, p.category_1,
              d.week, d.value
       FROM products p
       JOIN psi_data d ON d.product_id = p.id
       WHERE d.metric_type = 'stock_days_ttl'
         AND d.year = $1
         AND d.week >= ${currentWeek}
         AND d.week <= ${currentWeek + 8}
         ${productFilter}
       ORDER BY p.item_number, d.week`,
      params
    );

    // Reshape
    const products = {};
    for (const row of rows) {
      if (!products[row.id]) {
        products[row.id] = {
          id: row.id, item_number: row.item_number, model: row.model,
          brand: row.brand, category_1: row.category_1, weeks: {}
        };
      }
      products[row.id].weeks[`${currentYear}_${row.week}`] = parseFloat(row.value);
    }

    // Generate week headers
    const weekHeaders = [];
    for (let w = currentWeek; w <= currentWeek + 8; w++) {
      weekHeaders.push({ year: currentYear, week: w, key: `${currentYear}_${w}` });
    }

    res.json({ products: Object.values(products), weeks: weekHeaders });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/availability-chart/:productId
router.get('/availability-chart/:productId', authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { year: currentYear } = getCurrentISOWeek();

    const { rows } = await query(
      `SELECT metric_type, week, value FROM psi_data
       WHERE product_id = $1 AND year = $2
       AND metric_type IN ('availability', 'sell_out_kam', 'inventory_client')
       ORDER BY week`,
      [productId, currentYear]
    );

    const data = {};
    for (const row of rows) {
      if (!data[row.week]) data[row.week] = { week: row.week };
      data[row.week][row.metric_type] = parseFloat(row.value);
    }

    res.json({ productId, year: currentYear, data: Object.values(data) });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/alerts
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const { year: currentYear, week: currentWeek } = getCurrentISOWeek();
    const alerts = [];

    // Stockout risk: availability projected 0 within next 4 weeks
    const { rows: stockouts } = await query(
      `SELECT DISTINCT p.id, p.item_number, p.model, d.week, d.value
       FROM psi_data d JOIN products p ON p.id = d.product_id
       WHERE d.metric_type = 'availability' AND d.year = $1
         AND d.week BETWEEN $2 AND $3 AND d.value <= 0`,
      [currentYear, currentWeek, currentWeek + 4]
    );
    for (const r of stockouts) {
      alerts.push({
        type: 'stockout_risk', severity: 'high',
        product_id: r.id, product_model: r.model, item_number: r.item_number,
        week: r.week, year: currentYear,
        message: `Availability reaches ${r.value} in W${r.week}`
      });
    }

    // Overstock: stock_days_ttl > 180
    const { rows: overstocks } = await query(
      `SELECT DISTINCT p.id, p.item_number, p.model, d.week, d.value
       FROM psi_data d JOIN products p ON p.id = d.product_id
       WHERE d.metric_type = 'stock_days_ttl' AND d.year = $1
         AND d.week = $2 AND d.value > 180`,
      [currentYear, currentWeek]
    );
    for (const r of overstocks) {
      alerts.push({
        type: 'overstock', severity: 'medium',
        product_id: r.id, product_model: r.model, item_number: r.item_number,
        week: r.week, year: currentYear,
        message: `Stock Days TTL: ${Math.round(r.value)} days (>180)`
      });
    }

    // No demand: zero sell_out for 4+ consecutive weeks
    const { rows: noDemand } = await query(
      `SELECT p.id, p.item_number, p.model
       FROM products p
       WHERE NOT EXISTS (
         SELECT 1 FROM psi_data d
         WHERE d.product_id = p.id AND d.metric_type = 'sell_out_kam'
           AND d.year = $1 AND d.week BETWEEN $2 AND $3 AND d.value > 0
       )
       AND EXISTS (
         SELECT 1 FROM psi_data d
         WHERE d.product_id = p.id AND d.metric_type = 'sell_out_kam' AND d.year = $1
       )`,
      [currentYear, currentWeek - 4, currentWeek]
    );
    for (const r of noDemand) {
      alerts.push({
        type: 'no_demand', severity: 'low',
        product_id: r.id, product_model: r.model, item_number: r.item_number,
        week: currentWeek, year: currentYear,
        message: 'Zero sell-out for 4+ consecutive weeks'
      });
    }

    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
