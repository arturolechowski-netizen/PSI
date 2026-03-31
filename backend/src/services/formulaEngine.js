/**
 * PSI Formula Engine
 *
 * Implements all calculated metrics for the Purchase-Stock-Inventory planning grid.
 *
 * Metric hierarchy:
 *   IMPORTED  – written by import jobs (goods_on_way, confirmed_production, etc.)
 *   MANUAL    – entered by planners (sell_in, sell_out_kam, shops_target)
 *   CALCULATED– derived from the above (availability, demand, inventory_client,
 *               stock_days_terg, stock_days_ttl)
 */

'use strict';

// ---------------------------------------------------------------------------
// Metric type registry
// ---------------------------------------------------------------------------

/** All supported metric type identifiers (display order). */
const METRIC_TYPES = [
  'availability',
  'goods_on_way',
  'confirmed_production',
  'demand',
  'sell_in',
  'order_client',
  'sell_out_kam',
  'sell_out_report',
  'inventory_client',
  'stock_days_terg',
  'shops_report',
  'shops_target',
  'stock_days_ttl',
];

/** Metrics that planners enter manually. */
const MANUAL_METRICS = ['sell_in', 'sell_out_kam', 'shops_target'];

/** Metrics derived by the formula engine (never edited directly). */
const CALCULATED_METRICS = [
  'availability',
  'demand',
  'inventory_client',
  'stock_days_terg',
  'stock_days_ttl',
];

/** Metrics populated by Excel import jobs. */
const IMPORTED_METRICS = [
  'goods_on_way',
  'confirmed_production',
  'order_client',
  'sell_out_report',
  'shops_report',
];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Safely retrieve a numeric value from weekData at the given index.
 * Returns 0 for out-of-bounds, null, undefined, or the sentinel 'no sales'.
 *
 * @param {Object[]} weekData   - Full array of week objects
 * @param {number}   weekIdx    - Index into weekData
 * @param {string}   metric     - Key to read
 * @returns {number}
 */
function getVal(weekData, weekIdx, metric) {
  if (weekIdx < 0 || weekIdx >= weekData.length) return 0;
  const v = weekData[weekIdx][metric];
  if (v === null || v === undefined || v === 'no sales') return 0;
  return parseFloat(v) || 0;
}

/**
 * Sum the sell_out_kam values for up to 4 future weeks relative to `i`.
 *
 * @param {Object[]} weekData
 * @param {number}   i  - Reference week index
 * @returns {number}
 */
function nextFourSellOut(weekData, i) {
  return [1, 2, 3, 4].reduce(
    (sum, offset) => sum + getVal(weekData, i + offset, 'sell_out_kam'),
    0
  );
}

// ---------------------------------------------------------------------------
// Core recalculation function
// ---------------------------------------------------------------------------

/**
 * Recalculate all derived metrics for a single product across all weeks.
 *
 * The function is intentionally pure – it clones the input and returns a new
 * array so callers can compare before/after.
 *
 * Processing order per week (current week onwards):
 *   1. inventory_client  (future weeks only – current week value is imported/manual)
 *   2. stock_days_terg   (uses inventory_client + next 4 weeks sell_out_kam)
 *   3. availability      (future weeks only – current week value is imported)
 *   4. stock_days_ttl    (uses inventory_client + availability + next 4 weeks sell_out)
 *   5. demand auto-fill  (after frozen period, when stock_days_ttl < 90)
 *
 * @param {Object[]} weekData            - Array of week objects {week, year, <metrics>}
 *                                         Must cover at least currentWeekIndex + 4 items for
 *                                         accurate stock-day calculation.
 * @param {number}   currentWeekIndex    - Index of the "current" ISO week in weekData
 * @param {number}   [moq=1]             - Minimum order quantity for the product
 * @param {number}   [frozenPeriodWeeks=4] - Weeks ahead where demand is locked
 * @returns {Object[]} New array with calculated fields populated
 */
function recalculateProduct(weekData, currentWeekIndex, moq = 1, frozenPeriodWeeks = 4) {
  // Deep-clone so callers can diff before/after
  const result = weekData.map((w) => ({ ...w }));

  for (let i = currentWeekIndex; i < result.length; i++) {
    const isCurrent = i === currentWeekIndex;

    // -----------------------------------------------------------------------
    // 1. Inventory Client
    //    Formula: prev_inventory + sell_in - sell_out_kam
    //    Current week: value comes from the stock report import, not recalculated.
    // -----------------------------------------------------------------------
    if (!isCurrent) {
      const prevInventory = getVal(result, i - 1, 'inventory_client');
      const sellIn        = getVal(result, i,     'sell_in');
      const sellOutKam    = getVal(result, i,     'sell_out_kam');
      result[i].inventory_client = prevInventory + sellIn - sellOutKam;
    }

    // -----------------------------------------------------------------------
    // 2. Stock Days TERG  (client-side stock coverage)
    //    Formula: (inventory_client / sum(next 4 weeks sell_out_kam)) * 28
    //    Sentinel: 'no sales' when next 4 weeks sell_out = 0
    //    Edge:      if stock was ≤0 and is now positive → set to 1 (recovery flag)
    // -----------------------------------------------------------------------
    const inventory       = getVal(result, i, 'inventory_client');
    const next4SellOut    = nextFourSellOut(result, i);
    const prevStockTerg   = i > 0 ? result[i - 1].stock_days_terg : null;

    if (next4SellOut === 0) {
      result[i].stock_days_terg = 'no sales';
    } else if (
      inventory > 0 &&
      prevStockTerg !== null &&
      prevStockTerg !== 'no sales' &&
      parseFloat(prevStockTerg) <= 0
    ) {
      // Recovery from stockout – flag as 1 day so the heat map shows amber
      result[i].stock_days_terg = 1;
    } else {
      result[i].stock_days_terg = (inventory / next4SellOut) * 28;
    }

    // -----------------------------------------------------------------------
    // 3. Availability  (warehouse stock + incoming supply)
    //    Current week: sourced from import (STOCK PC / STOCK SBU), not recalculated.
    //    Future weeks:
    //      availability(t) = availability(t-1) + goods_on_way(t)
    //                      + confirmed_production(t) + demand(t) – sell_in(t) + sell_out(t)
    //    Special case: demand == 1 is used as a frozen-period placeholder flag.
    // -----------------------------------------------------------------------
    if (!isCurrent) {
      const prevAvail    = getVal(result, i - 1, 'availability');
      const gow          = getVal(result, i,     'goods_on_way');
      const confProd     = getVal(result, i,     'confirmed_production');
      const demand       = getVal(result, i,     'demand');
      const sellIn       = getVal(result, i,     'sell_in');
      const sellOut      = getVal(result, i,     'sell_out_kam');

      if (demand === 1) {
        // Frozen period: demand placeholder – exclude demand and sell-out adjustments
        result[i].availability = prevAvail + gow + confProd - sellIn;
      } else {
        result[i].availability = prevAvail + gow + confProd + demand - sellIn + sellOut;
      }
    }

    // -----------------------------------------------------------------------
    // 4. Stock Days TTL  (total stock coverage including availability)
    //    Formula: ((inventory_client + availability) / sum(next 4 weeks sell_out_kam)) * 28
    // -----------------------------------------------------------------------
    const availability    = getVal(result, i, 'availability');
    const prevStockTTL    = i > 0 ? result[i - 1].stock_days_ttl : null;
    const totalStock      = inventory + availability;

    if (next4SellOut === 0) {
      result[i].stock_days_ttl = 'no sales';
    } else if (
      totalStock > 0 &&
      prevStockTTL !== null &&
      prevStockTTL !== 'no sales' &&
      parseFloat(prevStockTTL) <= 0
    ) {
      result[i].stock_days_ttl = 1;
    } else {
      result[i].stock_days_ttl = (totalStock / next4SellOut) * 28;
    }

    // -----------------------------------------------------------------------
    // 5. Auto-fill Demand
    //    Only applied after the frozen period (> currentWeekIndex + frozenPeriodWeeks).
    //    Trigger: stock_days_ttl < 90 and demand is still 0 or the placeholder (1).
    //    Target coverage: 90 stock days.
    //    Quantity: max(ceil((90/28) * avgWeeklySellOut), moq)
    // -----------------------------------------------------------------------
    if (!isCurrent && i > currentWeekIndex + frozenPeriodWeeks) {
      const stockDaysTTL =
        typeof result[i].stock_days_ttl === 'number' ? result[i].stock_days_ttl : 999;

      const currentDemand = getVal(result, i, 'demand');

      if (stockDaysTTL < 90 && currentDemand <= 1) {
        const avgSellOut  = next4SellOut / 4;
        const targetUnits = Math.ceil((90 / 28) * avgSellOut);
        result[i].demand  = Math.max(targetUnits, moq);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  recalculateProduct,
  METRIC_TYPES,
  MANUAL_METRICS,
  CALCULATED_METRICS,
  IMPORTED_METRICS,
};
