const express = require('express');
const ExcelJS = require('exceljs');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const METRIC_ORDER = [
  'availability', 'goods_on_way', 'confirmed_production', 'demand',
  'sell_in', 'order_client', 'sell_out_kam', 'sell_out_report',
  'inventory_client', 'stock_days_terg', 'shops_report', 'shops_target', 'stock_days_ttl'
];

const METRIC_LABELS = {
  availability: 'Availability', goods_on_way: 'Goods on the Way',
  confirmed_production: 'Confirmed Production', demand: 'Demand',
  sell_in: 'Sell In', order_client: 'Order Client',
  sell_out_kam: 'Sell Out KAM', sell_out_report: 'Sell Out REPORT',
  inventory_client: 'Inventory Client', stock_days_terg: 'Stock Days TERG',
  shops_report: 'N° Shops Report', shops_target: 'N° Shops Target',
  stock_days_ttl: 'Stock Days TTL'
};

// GET /api/exports/excel
router.get('/excel', authenticate, async (req, res, next) => {
  try {
    const { year } = req.query;
    const exportYear = parseInt(year) || new Date().getFullYear();

    // Get products
    const { rows: products } = await query('SELECT * FROM products ORDER BY item_number');

    // Get all PSI data for the year
    const { rows: psiRows } = await query(
      'SELECT product_id, metric_type, week, value FROM psi_data WHERE year = $1',
      [exportYear]
    );

    // Build data map
    const dataMap = {};
    for (const r of psiRows) {
      const key = `${r.product_id}_${r.metric_type}`;
      if (!dataMap[key]) dataMap[key] = {};
      dataMap[key][r.week] = parseFloat(r.value);
    }

    // Get weeks (1-53)
    const weeks = [];
    for (let w = 1; w <= 53; w++) weeks.push(w);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('PSI Export');

    // Header rows
    const headerRow1 = ['Item Number', 'Model', 'Brand', 'Category', 'Metric'];
    const headerRow2 = ['', '', '', '', ''];
    for (const w of weeks) {
      headerRow1.push(`W${w}`);
      headerRow2.push(exportYear);
    }

    sheet.addRow(headerRow1);
    sheet.addRow(headerRow2);

    // Style headers
    sheet.getRow(1).font = { bold: true, size: 10 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

    // Data rows
    const calculatedMetrics = new Set(['availability', 'demand', 'inventory_client', 'stock_days_terg', 'stock_days_ttl']);
    const manualMetrics = new Set(['sell_in', 'sell_out_kam', 'shops_target']);

    for (const product of products) {
      for (const metric of METRIC_ORDER) {
        const row = [
          metric === METRIC_ORDER[0] ? product.item_number : '',
          metric === METRIC_ORDER[0] ? product.model : '',
          metric === METRIC_ORDER[0] ? product.brand : '',
          metric === METRIC_ORDER[0] ? product.category_1 : '',
          METRIC_LABELS[metric],
        ];

        const key = `${product.id}_${metric}`;
        for (const w of weeks) {
          row.push(dataMap[key]?.[w] ?? '');
        }

        const excelRow = sheet.addRow(row);

        // Color coding
        if (calculatedMetrics.has(metric)) {
          excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        } else if (manualMetrics.has(metric)) {
          excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        }
      }
    }

    // Column widths
    sheet.getColumn(1).width = 14;
    sheet.getColumn(2).width = 18;
    sheet.getColumn(3).width = 8;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 20;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=PSI_Export_${exportYear}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// GET /api/exports/audit
router.get('/audit', authenticate, async (req, res, next) => {
  try {
    const { product_id, user_id, start_date, end_date } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (product_id) { conditions.push(`a.product_id = $${idx++}`); values.push(product_id); }
    if (user_id) { conditions.push(`a.user_id = $${idx++}`); values.push(user_id); }
    if (start_date) { conditions.push(`a.created_at >= $${idx++}`); values.push(start_date); }
    if (end_date) { conditions.push(`a.created_at <= $${idx++}`); values.push(end_date); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT a.*, u.name as user_name, p.item_number, p.model
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN products p ON a.product_id = p.id
       ${where} ORDER BY a.created_at DESC LIMIT 5000`,
      values
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Log');
    sheet.addRow(['Timestamp', 'User', 'Product', 'Model', 'Metric', 'Year', 'Week', 'Old Value', 'New Value', 'Action']);
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow([
        r.created_at, r.user_name, r.item_number, r.model,
        r.metric_type, r.year, r.week, r.old_value, r.new_value, r.action
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=PSI_Audit_Log.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
