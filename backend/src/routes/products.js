const express = require('express');
const { query } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/products - list with filtering
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { category_1, category_2, category_3, category_4, category_5, brand, status, description, search, page, pageSize } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (category_1) { conditions.push(`category_1 = $${idx++}`); values.push(category_1); }
    if (category_2) { conditions.push(`category_2 = $${idx++}`); values.push(category_2); }
    if (category_3) { conditions.push(`category_3 = $${idx++}`); values.push(category_3); }
    if (category_4) { conditions.push(`category_4 = $${idx++}`); values.push(category_4); }
    if (category_5) { conditions.push(`category_5 = $${idx++}`); values.push(category_5); }
    if (brand) { conditions.push(`brand = $${idx++}`); values.push(brand); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (description) { conditions.push(`description = $${idx++}`); values.push(description); }
    if (search) {
      conditions.push(`(CAST(item_number AS TEXT) ILIKE $${idx} OR model ILIKE $${idx} OR ean ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = parseInt(pageSize) || 100;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) FROM products ${where}`, values);
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await query(
      `SELECT * FROM products ${where} ORDER BY item_number ASC LIMIT $${idx++} OFFSET $${idx}`,
      [...values, limit, offset]
    );

    res.json({ products: rows, meta: { total, page: parseInt(page) || 1, pageSize: limit } });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/filters - get unique filter values
router.get('/filters', authenticate, async (req, res, next) => {
  try {
    const [c1, c2, c3, c4, c5, brands, statuses, descriptions] = await Promise.all([
      query('SELECT DISTINCT category_1 FROM products WHERE category_1 IS NOT NULL ORDER BY category_1'),
      query('SELECT DISTINCT category_2 FROM products WHERE category_2 IS NOT NULL ORDER BY category_2'),
      query('SELECT DISTINCT category_3 FROM products WHERE category_3 IS NOT NULL ORDER BY category_3'),
      query('SELECT DISTINCT category_4 FROM products WHERE category_4 IS NOT NULL ORDER BY category_4'),
      query('SELECT DISTINCT category_5 FROM products WHERE category_5 IS NOT NULL ORDER BY category_5'),
      query('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand'),
      query('SELECT DISTINCT status FROM products WHERE status IS NOT NULL ORDER BY status'),
      query('SELECT DISTINCT description FROM products WHERE description IS NOT NULL ORDER BY description'),
    ]);

    res.json({
      category_1: c1.rows.map(r => r.category_1),
      category_2: c2.rows.map(r => r.category_2),
      category_3: c3.rows.map(r => r.category_3),
      category_4: c4.rows.map(r => r.category_4),
      category_5: c5.rows.map(r => r.category_5),
      brands: brands.rows.map(r => r.brand),
      statuses: statuses.rows.map(r => r.status),
      descriptions: descriptions.rows.map(r => r.description),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', authenticate, requireRole('admin', 'planner'), async (req, res, next) => {
  try {
    const { item_number, model, ean, brand, manufacturer, description, status,
      category_1, category_2, category_3, category_4, category_5, moq } = req.body;

    if (!item_number || !model || !brand) {
      return res.status(400).json({ error: 'item_number, model, and brand are required' });
    }

    const { rows } = await query(
      `INSERT INTO products (item_number, model, ean, brand, manufacturer, description, status,
        category_1, category_2, category_3, category_4, category_5, moq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [item_number, model, ean, brand, manufacturer, description, status,
        category_1, category_2, category_3, category_4, category_5, moq || 1]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, requireRole('admin', 'planner'), async (req, res, next) => {
  try {
    const fields = ['item_number', 'model', 'ean', 'brand', 'manufacturer', 'description',
      'status', 'category_1', 'category_2', 'category_3', 'category_4', 'category_5', 'moq'];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        values.push(req.body[f]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    sets.push('updated_at = NOW()');
    values.push(req.params.id);

    const { rows } = await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/bulk-import
router.post('/bulk-import', authenticate, requireRole('admin', 'planner'), async (req, res, next) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    let imported = 0;
    for (const p of products) {
      if (!p.item_number || !p.model) continue;
      await query(
        `INSERT INTO products (item_number, model, ean, brand, manufacturer, description, status,
          category_1, category_2, category_3, category_4, category_5, moq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (item_number) DO UPDATE SET
           model=$2, ean=$3, brand=$4, manufacturer=$5, description=$6, status=$7,
           category_1=$8, category_2=$9, category_3=$10, category_4=$11, category_5=$12,
           moq=$13, updated_at=NOW()`,
        [p.item_number, p.model, p.ean || null, p.brand || 'GOR', p.manufacturer || null,
          p.description || null, p.status || null, p.category_1 || null, p.category_2 || null,
          p.category_3 || null, p.category_4 || null, p.category_5 || null, p.moq || 1]
      );
      imported++;
    }

    res.json({ message: `Imported ${imported} products`, count: imported });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
