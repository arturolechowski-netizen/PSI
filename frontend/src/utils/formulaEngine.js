// Calculate all derived metrics for a product given manual/imported values
// weekData: array of week objects with all metric values
// currentWeekIndex: index of the current week in weekData
// moq: minimum order quantity for this product
// Returns: updated weekData array

export function recalculateProduct(weekData, currentWeekIndex, moq = 1) {
  const result = weekData.map((w) => ({ ...w }))

  function getVal(idx, metric) {
    if (idx < 0 || idx >= result.length) return 0
    const v = result[idx][metric]
    if (v === null || v === undefined || v === 'no sales') return 0
    return parseFloat(v) || 0
  }

  for (let i = currentWeekIndex; i < result.length; i++) {
    const isCurrent = i === currentWeekIndex

    // Inventory Client (future only)
    if (!isCurrent) {
      result[i].inventory_client =
        getVal(i - 1, 'inventory_client') +
        getVal(i, 'sell_in') -
        getVal(i, 'sell_out_kam')
    }

    // Stock Days TERG
    const inv = getVal(i, 'inventory_client')
    const next4 = [1, 2, 3, 4].reduce((s, o) => s + getVal(i + o, 'sell_out_kam'), 0)
    const prevTerg = i > 0 ? result[i - 1].stock_days_terg : null

    if (next4 === 0) {
      result[i].stock_days_terg = 'no sales'
    } else if (inv > 0 && prevTerg !== null && parseFloat(prevTerg) <= 0) {
      result[i].stock_days_terg = 1
    } else {
      result[i].stock_days_terg = (inv / next4) * 28
    }

    // Availability (future only)
    if (!isCurrent) {
      const prevAvail = getVal(i - 1, 'availability')
      const gow = getVal(i, 'goods_on_way')
      const cp = getVal(i, 'confirmed_production')
      const demand = getVal(i, 'demand')
      const si = getVal(i, 'sell_in')
      const so = getVal(i, 'sell_out_kam')

      if (demand === 1) {
        result[i].availability = prevAvail + gow + cp - si
      } else {
        result[i].availability = prevAvail + gow + cp + demand - si + so
      }
    }

    // Stock Days TTL
    const avail = getVal(i, 'availability')
    const prevTtl = i > 0 ? result[i - 1].stock_days_ttl : null

    if (next4 === 0) {
      result[i].stock_days_ttl = 'no sales'
    } else if (inv + avail > 0 && prevTtl !== null && parseFloat(prevTtl) <= 0) {
      result[i].stock_days_ttl = 1
    } else {
      result[i].stock_days_ttl = ((inv + avail) / next4) * 28
    }
  }

  return result
}

export const METRIC_LABELS = {
  availability: 'Availability',
  goods_on_way: 'Goods on the Way',
  confirmed_production: 'Confirmed Production',
  demand: 'Demand',
  sell_in: 'Sell In',
  order_client: 'Order Client',
  sell_out_kam: 'Sell Out KAM',
  sell_out_report: 'Sell Out REPORT',
  inventory_client: 'Inventory Client',
  stock_days_terg: 'Stock Days TERG',
  shops_report: 'N° Shops Report',
  shops_target: 'N° Shops Target',
  stock_days_ttl: 'Stock Days TTL',
}

export const METRIC_ORDER = [
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
]

export const MANUAL_METRICS = new Set(['sell_in', 'sell_out_kam', 'shops_target'])
export const CALCULATED_METRICS = new Set([
  'availability',
  'demand',
  'inventory_client',
  'stock_days_terg',
  'stock_days_ttl',
])
export const IMPORTED_METRICS = new Set([
  'goods_on_way',
  'confirmed_production',
  'order_client',
  'sell_out_report',
  'shops_report',
])

export function getMetricRowStyle(metric) {
  if (CALCULATED_METRICS.has(metric)) return 'bg-blue-950/50'
  if (MANUAL_METRICS.has(metric)) return 'bg-yellow-950/30'
  return 'bg-slate-800/20'
}

export function getMetricLabelStyle(metric) {
  if (CALCULATED_METRICS.has(metric)) return 'text-blue-300'
  if (MANUAL_METRICS.has(metric)) return 'text-yellow-300'
  return 'text-slate-300'
}

export function getStockDaysColor(value) {
  if (value === 'no sales' || value === null || value === undefined) return 'bg-slate-700 text-slate-400'
  const v = parseFloat(value)
  if (isNaN(v)) return ''
  if (v < 30 || v > 180) return 'bg-red-900/70 text-red-200'
  if (v < 60 || v > 120) return 'bg-yellow-900/70 text-yellow-200'
  return 'bg-green-900/70 text-green-200'
}

export function formatValue(metric, value) {
  if (value === null || value === undefined) return ''
  if (value === 'no sales') return 'no sales'
  if (['stock_days_terg', 'stock_days_ttl'].includes(metric)) {
    if (typeof value === 'string') return value
    return typeof value === 'number' ? Math.round(value) : value
  }
  const n = parseFloat(value)
  if (isNaN(n)) return value
  return Number.isInteger(n) ? n.toString() : n.toFixed(1)
}

export function isMetricEditable(metric, userRole) {
  if (MANUAL_METRICS.has(metric)) return true
  return false
}
