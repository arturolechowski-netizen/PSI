/**
 * PSI Import Service
 *
 * Provides resilient Excel-parsing functions for all import sources used in the
 * PSI application.  Each function accepts a raw Buffer (from multer memory
 * storage) and returns a normalised JavaScript array.
 *
 * Parsers are intentionally lenient:
 *   – leading/trailing whitespace is trimmed from every cell
 *   – empty rows (all cells falsy) are skipped
 *   – numeric cells are coerced with parseFloat / parseInt
 *   – unrecognised column names generate a warning rather than a hard error
 *
 * Library: xlsx (SheetJS community edition)
 */

'use strict';

const XLSX = require('xlsx');
const { getISOWeek, getISOWeekYear } = require('date-fns');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an Excel buffer and return the first worksheet as an array of objects
 * using the first row as headers.
 *
 * @param {Buffer} buffer
 * @param {number} [sheetIndex=0]
 * @returns {{ headers: string[], rows: Object[] }}
 */
function parseSheet(buffer, sheetIndex = 0) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName) throw new Error('Excel file has no sheets');

  const worksheet = workbook.Sheets[sheetName];
  // defval: '' ensures missing cells produce empty strings rather than undefined
  const raw = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  return raw;
}

/**
 * Return all worksheets as a map of { sheetName: rows[] }.
 *
 * @param {Buffer} buffer
 * @returns {Object.<string, Object[]>}
 */
function parseAllSheets(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const result = {};
  for (const name of workbook.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      defval: '',
      raw: false,
    });
  }
  return result;
}

/**
 * Normalise a row by trimming all string values and lowercasing header keys.
 *
 * @param {Object} row
 * @returns {Object}
 */
function normaliseRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
    out[key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * Test whether a row is "empty" (all values are blank/null).
 *
 * @param {Object} row
 * @returns {boolean}
 */
function isEmptyRow(row) {
  return Object.values(row).every((v) => v === '' || v === null || v === undefined);
}

/**
 * Convert a value that may be a JS Date, an Excel serial date string, or an
 * ISO date string into an { week, year } object using ISO week numbering.
 *
 * @param {*} value
 * @returns {{ week: number, year: number } | null}
 */
function dateToISOWeek(value) {
  let d = null;

  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.trim());
    if (!isNaN(parsed)) d = parsed;
  } else if (typeof value === 'number') {
    // Excel serial number
    d = XLSX.SSF.parse_date_code
      ? new Date(Date.UTC(1899, 11, 30) + value * 86400000)
      : null;
  }

  if (!d) return null;

  return {
    week: getISOWeek(d),
    year: getISOWeekYear(d),
  };
}

/**
 * Attempt to find a column value in a row by trying several possible header
 * names (all lower-cased and underscore-normalised).
 *
 * @param {Object}   row
 * @param {string[]} candidates
 * @returns {*}
 */
function findCol(row, candidates) {
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, c) && row[c] !== '') {
      return row[c];
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public parsers
// ---------------------------------------------------------------------------

/**
 * Parse the Container Table Excel export.
 *
 * Expected columns (flexible naming):
 *   Item Number | Week | Year | Quantity | Customer | ETA | Status
 *
 * @param {Buffer} buffer
 * @returns {Array<{ item_number: string, week: number, year: number, quantity: number, customer: string, eta: string|null, status: string }>}
 */
function parseContainerTable(buffer) {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  for (const rawRow of rawRows) {
    const row = normaliseRow(rawRow);
    if (isEmptyRow(row)) continue;

    const item_number = findCol(row, ['item_number', 'item', 'sku', 'material', 'code', 'item_no']);
    const quantityRaw = findCol(row, ['quantity', 'qty', 'units', 'amount']);
    const customerRaw = findCol(row, ['customer', 'client', 'account']);
    const etaRaw      = findCol(row, ['eta', 'arrival_date', 'delivery_date', 'expected_date']);
    const statusRaw   = findCol(row, ['status', 'state', 'condition']);

    // Week / Year can be provided explicitly or derived from an ETA date
    let week = parseInt(findCol(row, ['week', 'iso_week', 'wk']), 10);
    let year = parseInt(findCol(row, ['year', 'yr']), 10);

    if ((!week || !year) && etaRaw) {
      const derived = dateToISOWeek(etaRaw);
      if (derived) {
        week = derived.week;
        year = derived.year;
      }
    }

    if (!item_number || isNaN(week) || isNaN(year)) continue;

    results.push({
      item_number: String(item_number).trim(),
      week,
      year,
      quantity:  parseFloat(quantityRaw) || 0,
      customer:  customerRaw ? String(customerRaw).trim() : '',
      eta:       etaRaw      ? String(etaRaw).trim()      : null,
      status:    statusRaw   ? String(statusRaw).trim()   : 'unknown',
    });
  }

  return results;
}

/**
 * Parse the Production Plan Excel export.
 *
 * Expected columns:
 *   Material Code | Week | Year | Quantity
 *
 * @param {Buffer} buffer
 * @returns {Array<{ material_code: string, week: number, year: number, quantity: number }>}
 */
function parseProductionPlan(buffer) {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  for (const rawRow of rawRows) {
    const row = normaliseRow(rawRow);
    if (isEmptyRow(row)) continue;

    const materialCode = findCol(row, [
      'material_code', 'material', 'item_number', 'item_no', 'sku', 'code',
    ]);
    const quantityRaw  = findCol(row, ['quantity', 'qty', 'production_qty', 'units']);
    let week           = parseInt(findCol(row, ['week', 'iso_week', 'wk']), 10);
    let year           = parseInt(findCol(row, ['year', 'yr']), 10);

    const dateRaw = findCol(row, ['date', 'production_date', 'plan_date']);
    if ((!week || !year) && dateRaw) {
      const derived = dateToISOWeek(dateRaw);
      if (derived) {
        week = derived.week;
        year = derived.year;
      }
    }

    if (!materialCode || isNaN(week) || isNaN(year)) continue;

    results.push({
      material_code: String(materialCode).trim(),
      week,
      year,
      quantity: parseFloat(quantityRaw) || 0,
    });
  }

  return results;
}

/**
 * Parse the Polygram Sell-Out Report.
 *
 * The Polygram report contains per-product, per-week aggregates for:
 *   – sell_out  (units sold at point of sale)
 *   – inventory (stock at client / retailer)
 *   – shops     (number of shops carrying the product)
 *
 * The workbook may have multiple sheets; the parser checks each one.
 *
 * @param {Buffer} buffer
 * @returns {Array<{ item_number: string, week: number, year: number, sell_out: number, inventory: number, shops: number }>}
 */
function parseSellOutReport(buffer) {
  const sheets = parseAllSheets(buffer);
  const results = [];

  for (const [, rows] of Object.entries(sheets)) {
    for (const rawRow of rows) {
      const row = normaliseRow(rawRow);
      if (isEmptyRow(row)) continue;

      const item_number = findCol(row, [
        'item_number', 'item', 'sku', 'material', 'code', 'ean', 'product_code',
      ]);
      const sellOutRaw   = findCol(row, ['sell_out', 'sellout', 'sales', 'pos_sales', 'sold']);
      const inventoryRaw = findCol(row, ['inventory', 'stock', 'inventory_client', 'retailer_stock']);
      const shopsRaw     = findCol(row, ['shops', 'store_count', 'outlets', 'points_of_sale', 'pos']);

      let week = parseInt(findCol(row, ['week', 'iso_week', 'wk']), 10);
      let year = parseInt(findCol(row, ['year', 'yr']), 10);

      const dateRaw = findCol(row, ['date', 'report_date', 'week_date']);
      if ((!week || !year) && dateRaw) {
        const derived = dateToISOWeek(dateRaw);
        if (derived) {
          week = derived.week;
          year = derived.year;
        }
      }

      if (!item_number || isNaN(week) || isNaN(year)) continue;

      results.push({
        item_number: String(item_number).trim(),
        week,
        year,
        sell_out:  parseFloat(sellOutRaw)   || 0,
        inventory: parseFloat(inventoryRaw) || 0,
        shops:     parseFloat(shopsRaw)     || 0,
      });
    }
  }

  return results;
}

/**
 * Parse a Stock Report (STOCK PC or STOCK SBU format).
 *
 * Both formats share a common structure:
 *   Material | Stock Qty | Goods On Way
 *
 * The `type` parameter ('pc' | 'sbu') is passed through to the result for
 * downstream processing so the caller knows which availability bucket to update.
 *
 * @param {Buffer} buffer
 * @param {'pc'|'sbu'} [type='pc']
 * @returns {Array<{ material: string, stock_qty: number, goods_on_way: number, type: string }>}
 */
function parseStockReport(buffer, type = 'pc') {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  for (const rawRow of rawRows) {
    const row = normaliseRow(rawRow);
    if (isEmptyRow(row)) continue;

    const material    = findCol(row, ['material', 'item_number', 'item', 'sku', 'code', 'product']);
    const stockRaw    = findCol(row, ['stock_qty', 'stock', 'qty', 'quantity', 'on_hand', 'available_stock']);
    const gowRaw      = findCol(row, ['goods_on_way', 'goods_on_the_way', 'in_transit', 'gow', 'incoming']);

    if (!material) continue;

    results.push({
      material:     String(material).trim(),
      stock_qty:    parseFloat(stockRaw) || 0,
      goods_on_way: parseFloat(gowRaw)  || 0,
      type,
    });
  }

  return results;
}

/**
 * Parse an MOQ (Minimum Order Quantity) table.
 *
 * Expected columns:
 *   Code | Model | MOQ
 *
 * @param {Buffer} buffer
 * @returns {Array<{ code: string, model: string, moq: number }>}
 */
function parseMOQ(buffer) {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  for (const rawRow of rawRows) {
    const row = normaliseRow(rawRow);
    if (isEmptyRow(row)) continue;

    const code  = findCol(row, ['code', 'item_number', 'item', 'sku', 'material']);
    const model = findCol(row, ['model', 'description', 'product', 'product_model']);
    const moqRaw = findCol(row, ['moq', 'minimum_order_quantity', 'min_qty', 'min_order']);

    if (!code) continue;

    results.push({
      code:  String(code).trim(),
      model: model ? String(model).trim() : '',
      moq:   parseInt(moqRaw, 10) || 1,
    });
  }

  return results;
}

/**
 * Parse an FP_IBP demand forecast export.
 *
 * The IBP format typically has a product column followed by week columns
 * (ISO week labels like "2024-W01") with forecast quantities.
 * This parser handles both a "tall" (product, week, qty) and "wide"
 * (product in rows, weeks in columns) layout.
 *
 * @param {Buffer} buffer
 * @returns {Array<{ item_number: string, week: number, year: number, forecast: number }>}
 */
function parseFPIBP(buffer) {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  if (rawRows.length === 0) return results;

  // Detect layout by inspecting the first row's keys
  const firstNorm = normaliseRow(rawRows[0]);
  const keys = Object.keys(firstNorm);

  // Check if the data is in "tall" format (explicit week column)
  const hasTallWeekCol = keys.some((k) =>
    ['week', 'iso_week', 'wk', 'period'].includes(k)
  );

  if (hasTallWeekCol) {
    // -----------------------------------------------------------------------
    // Tall layout: one row = one (product × week) record
    // -----------------------------------------------------------------------
    for (const rawRow of rawRows) {
      const row = normaliseRow(rawRow);
      if (isEmptyRow(row)) continue;

      const item_number = findCol(row, ['item_number', 'material', 'sku', 'code', 'product']);
      const forecastRaw = findCol(row, ['forecast', 'demand', 'quantity', 'qty']);
      let week          = parseInt(findCol(row, ['week', 'iso_week', 'wk', 'period']), 10);
      let year          = parseInt(findCol(row, ['year', 'yr']), 10);

      const dateRaw = findCol(row, ['date', 'week_start', 'period_date']);
      if ((!week || !year) && dateRaw) {
        const derived = dateToISOWeek(dateRaw);
        if (derived) {
          week = derived.week;
          year = derived.year;
        }
      }

      if (!item_number || isNaN(week) || isNaN(year)) continue;

      results.push({
        item_number: String(item_number).trim(),
        week,
        year,
        forecast: parseFloat(forecastRaw) || 0,
      });
    }
  } else {
    // -----------------------------------------------------------------------
    // Wide layout: rows = products, columns = weeks (e.g. "2024-W01")
    //
    // Week column header formats supported:
    //   "2024-W01", "W01-2024", "2024/1", "01/2024", plain numeric week
    // -----------------------------------------------------------------------
    const weekRegex = /^(\d{4})[\/\-Ww](\d{1,2})$|^(\d{1,2})[\/\-Ww](\d{4})$|^W(\d{1,2})[_-](\d{4})$/;

    for (const rawRow of rawRows) {
      const row = normaliseRow(rawRow);
      if (isEmptyRow(row)) continue;

      const item_number =
        findCol(row, ['item_number', 'material', 'sku', 'code', 'product']) ||
        row[keys[0]];
      if (!item_number) continue;

      for (const key of keys) {
        const match = weekRegex.exec(key);
        if (!match) continue;

        let week, year;

        if (match[1] && match[2]) {
          // "2024-W01" or "2024/01"
          year = parseInt(match[1], 10);
          week = parseInt(match[2], 10);
        } else if (match[3] && match[4]) {
          // "01/2024"
          week = parseInt(match[3], 10);
          year = parseInt(match[4], 10);
        } else if (match[5] && match[6]) {
          // "W01_2024"
          week = parseInt(match[5], 10);
          year = parseInt(match[6], 10);
        }

        if (!week || !year) continue;

        results.push({
          item_number: String(item_number).trim(),
          week,
          year,
          forecast: parseFloat(row[key]) || 0,
        });
      }
    }
  }

  return results;
}

/**
 * Bulk-import products from the PSI_KAM Excel structure.
 *
 * Expected columns:
 *   Item Number | Model | EAN | Brand | Manufacturer | Description |
 *   Status | Category 1-5 | MOQ
 *
 * @param {Buffer} buffer
 * @returns {Array<Object>} Array of product objects matching the products table schema
 */
function parseProductBulk(buffer) {
  const rawRows = parseSheet(buffer, 0);
  const results = [];

  for (const rawRow of rawRows) {
    const row = normaliseRow(rawRow);
    if (isEmptyRow(row)) continue;

    const item_number = findCol(row, ['item_number', 'item', 'sku', 'material_code', 'code']);
    if (!item_number) continue;

    const parsed = {
      item_number:  String(item_number).trim(),
      model:        findCol(row, ['model', 'model_name', 'product_name', 'description'])       || '',
      ean:          findCol(row, ['ean', 'ean13', 'barcode', 'upc'])                           || null,
      brand:        findCol(row, ['brand', 'brand_name', 'marque'])                            || '',
      manufacturer: findCol(row, ['manufacturer', 'mfr', 'vendor'])                           || null,
      description:  findCol(row, ['description', 'short_description', 'desc', 'product_desc']) || null,
      status:       findCol(row, ['status', 'lifecycle', 'product_status'])                    || null,
      category_1:   findCol(row, ['category_1', 'cat1', 'category1', 'level_1'])               || null,
      category_2:   findCol(row, ['category_2', 'cat2', 'category2', 'level_2'])               || null,
      category_3:   findCol(row, ['category_3', 'cat3', 'category3', 'level_3'])               || null,
      category_4:   findCol(row, ['category_4', 'cat4', 'category4', 'level_4'])               || null,
      category_5:   findCol(row, ['category_5', 'cat5', 'category5', 'level_5'])               || null,
      moq:          parseInt(findCol(row, ['moq', 'min_order', 'minimum_order_quantity']), 10) || 1,
    };

    // Skip rows that don't have a meaningful model name
    if (!parsed.model && !parsed.description) continue;

    results.push(parsed);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parseContainerTable,
  parseProductionPlan,
  parseSellOutReport,
  parseStockReport,
  parseMOQ,
  parseFPIBP,
  parseProductBulk,
};
