const express = require('express');
const multer = require('multer');
const { query, getClient } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const importService = require('../services/importService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Helper: save preview and return import_log ID
async function createImportLog(userId, sourceType, fileName, previewData) {
  const { rows } = await query(
    `INSERT INTO import_logs (user_id, source_type, file_name, preview_data, status)
     VALUES ($1,$2,$3,$4,'pending') RETURNING id`,
    [userId, sourceType, fileName, JSON.stringify(previewData.slice(0, 100))]
  );
  return rows[0].id;
}

// POST /api/imports/container-table
router.post('/container-table', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseContainerTable(req.file.buffer);
    // Filter for TERG customer by default
    const customer = req.body.customer || 'TERG';
    const filtered = customer === '*' ? parsed : parsed.filter(r => r.customer.toUpperCase().includes(customer.toUpperCase()));
    const logId = await createImportLog(req.user.id, 'container_table', req.file.originalname, filtered);
    res.json({ importLogId: logId, preview: filtered.slice(0, 50), totalRows: filtered.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/production-plan
router.post('/production-plan', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseProductionPlan(req.file.buffer);
    const logId = await createImportLog(req.user.id, 'production_plan', req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/sell-out-report
router.post('/sell-out-report', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseSellOutReport(req.file.buffer);
    const logId = await createImportLog(req.user.id, 'sell_out_report', req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/stock-report
router.post('/stock-report', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const type = req.body.type || 'pc'; // 'pc' or 'sbu'
    const parsed = importService.parseStockReport(req.file.buffer, type);
    const logId = await createImportLog(req.user.id, `stock_${type}`, req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/moq
router.post('/moq', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseMOQ(req.file.buffer);
    const logId = await createImportLog(req.user.id, 'moq', req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/fp-ibp
router.post('/fp-ibp', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseFPIBP(req.file.buffer);
    const logId = await createImportLog(req.user.id, 'fp_ibp', req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/products - bulk product import
router.post('/products', authenticate, requireRole('admin', 'planner'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const parsed = importService.parseProductBulk(req.file.buffer);
    const logId = await createImportLog(req.user.id, 'product_bulk', req.file.originalname, parsed);
    res.json({ importLogId: logId, preview: parsed.slice(0, 50), totalRows: parsed.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/imports/confirm/:id - commit a pending import
router.post('/confirm/:id', authenticate, requireRole('admin', 'planner'), async (req, res, next) => {
  const dbClient = await getClient();
  try {
    const { rows: logs } = await query('SELECT * FROM import_logs WHERE id = $1', [req.params.id]);
    if (logs.length === 0) return res.status(404).json({ error: 'Import log not found' });
    const log = logs[0];
    if (log.status !== 'pending') return res.status(400).json({ error: 'Import already processed' });

    const data = log.preview_data;
    let affected = 0;

    await dbClient.query('BEGIN');

    switch (log.source_type) {
      case 'container_table': {
        for (const row of data) {
          const prod = await dbClient.query('SELECT id FROM products WHERE CAST(item_number AS TEXT) = $1', [row.item_number]);
          if (prod.rows.length === 0) continue;
          const pid = prod.rows[0].id;
          await dbClient.query(
            `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
             VALUES ($1,'goods_on_way',$2,$3,COALESCE((SELECT value FROM psi_data WHERE product_id=$1 AND metric_type='goods_on_way' AND year=$2 AND week=$3),0)+$4,FALSE,$5,NOW())
             ON CONFLICT (product_id, metric_type, year, week)
             DO UPDATE SET value = psi_data.value + $4, updated_by=$5, updated_at=NOW()`,
            [pid, row.year, row.week, row.quantity, req.user.id]
          );
          affected++;
        }
        break;
      }
      case 'production_plan': {
        for (const row of data) {
          const prod = await dbClient.query('SELECT id FROM products WHERE CAST(item_number AS TEXT) = $1', [row.material_code]);
          if (prod.rows.length === 0) continue;
          await dbClient.query(
            `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
             VALUES ($1,'confirmed_production',$2,$3,$4,FALSE,$5,NOW())
             ON CONFLICT (product_id, metric_type, year, week)
             DO UPDATE SET value=$4, updated_by=$5, updated_at=NOW()`,
            [prod.rows[0].id, row.year, row.week, row.quantity, req.user.id]
          );
          affected++;
        }
        break;
      }
      case 'sell_out_report': {
        for (const row of data) {
          const prod = await dbClient.query('SELECT id FROM products WHERE CAST(item_number AS TEXT) = $1', [row.item_number]);
          if (prod.rows.length === 0) continue;
          const pid = prod.rows[0].id;
          const metrics = [
            ['sell_out_report', row.sell_out],
            ['inventory_client', row.inventory],
            ['shops_report', row.shops],
          ];
          for (const [metric, value] of metrics) {
            if (value === 0 && metric !== 'sell_out_report') continue;
            await dbClient.query(
              `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
               VALUES ($1,$2,$3,$4,$5,FALSE,$6,NOW())
               ON CONFLICT (product_id, metric_type, year, week)
               DO UPDATE SET value=$5, updated_by=$6, updated_at=NOW()`,
              [pid, metric, row.year, row.week, value, req.user.id]
            );
          }
          affected++;
        }
        break;
      }
      case 'stock_pc':
      case 'stock_sbu': {
        // Stock reports update current week availability
        const now = new Date();
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const currentWeek = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
        const currentYear = d.getUTCFullYear();

        for (const row of data) {
          const prod = await dbClient.query('SELECT id FROM products WHERE CAST(item_number AS TEXT) = $1', [row.material]);
          if (prod.rows.length === 0) continue;
          const pid = prod.rows[0].id;
          // Update availability (sum of stock)
          await dbClient.query(
            `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
             VALUES ($1,'availability',$2,$3,COALESCE((SELECT value FROM psi_data WHERE product_id=$1 AND metric_type='availability' AND year=$2 AND week=$3),0)+$4,FALSE,$5,NOW())
             ON CONFLICT (product_id, metric_type, year, week)
             DO UPDATE SET value = psi_data.value + $4, updated_by=$5, updated_at=NOW()`,
            [pid, currentYear, currentWeek, row.stock_qty, req.user.id]
          );
          // Also update goods_on_way from stock report if present
          if (row.goods_on_way > 0) {
            await dbClient.query(
              `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
               VALUES ($1,'goods_on_way',$2,$3,$4,FALSE,$5,NOW())
               ON CONFLICT (product_id, metric_type, year, week)
               DO UPDATE SET value=$4, updated_by=$5, updated_at=NOW()`,
              [pid, currentYear, currentWeek, row.goods_on_way, req.user.id]
            );
          }
          affected++;
        }
        break;
      }
      case 'moq': {
        for (const row of data) {
          const result = await dbClient.query(
            'UPDATE products SET moq = $1, updated_at = NOW() WHERE CAST(item_number AS TEXT) = $2',
            [row.moq, row.code]
          );
          affected += result.rowCount;
        }
        break;
      }
      case 'fp_ibp': {
        for (const row of data) {
          const prod = await dbClient.query('SELECT id FROM products WHERE CAST(item_number AS TEXT) = $1', [row.item_number]);
          if (prod.rows.length === 0) continue;
          await dbClient.query(
            `INSERT INTO psi_data (product_id, metric_type, year, week, value, is_manual, updated_by, updated_at)
             VALUES ($1,'demand',$2,$3,$4,FALSE,$5,NOW())
             ON CONFLICT (product_id, metric_type, year, week)
             DO UPDATE SET value=$4, updated_by=$5, updated_at=NOW()`,
            [prod.rows[0].id, row.year, row.week, row.forecast, req.user.id]
          );
          affected++;
        }
        break;
      }
      case 'product_bulk': {
        for (const p of data) {
          await dbClient.query(
            `INSERT INTO products (item_number, model, ean, brand, manufacturer, description, status,
              category_1, category_2, category_3, category_4, category_5, moq)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (item_number) DO UPDATE SET
              model=$2, ean=$3, brand=$4, manufacturer=$5, description=$6, status=$7,
              category_1=$8, category_2=$9, category_3=$10, category_4=$11, category_5=$12,
              moq=$13, updated_at=NOW()`,
            [p.item_number, p.model, p.ean, p.brand || 'GOR', p.manufacturer, p.description,
              p.status, p.category_1, p.category_2, p.category_3, p.category_4, p.category_5, p.moq || 1]
          );
          affected++;
        }
        break;
      }
    }

    await dbClient.query(
      'UPDATE import_logs SET status = $1, records_affected = $2 WHERE id = $3',
      ['confirmed', affected, req.params.id]
    );

    // Audit log
    await dbClient.query(
      `INSERT INTO audit_log (user_id, action, created_at) VALUES ($1, $2, NOW())`,
      [req.user.id, `import_${log.source_type}_confirmed_${affected}_records`]
    );

    await dbClient.query('COMMIT');
    res.json({ success: true, recordsAffected: affected });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    await query('UPDATE import_logs SET status=$1, error_message=$2 WHERE id=$3',
      ['failed', err.message, req.params.id]);
    next(err);
  } finally {
    dbClient.release();
  }
});

// GET /api/imports/history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT il.*, u.name as user_name FROM import_logs il
       LEFT JOIN users u ON il.user_id = u.id
       ORDER BY il.created_at DESC LIMIT 100`
    );
    // Strip large preview_data from history list
    res.json(rows.map(r => ({ ...r, preview_data: undefined })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
