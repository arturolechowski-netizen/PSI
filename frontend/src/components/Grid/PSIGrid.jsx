import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import useStore from '../../store/useStore'
import FilterPanel from './FilterPanel'
import {
  METRIC_ORDER, METRIC_LABELS, MANUAL_METRICS, CALCULATED_METRICS,
  getMetricRowStyle, getMetricLabelStyle, getStockDaysColor, formatValue,
  recalculateProduct
} from '../../utils/formulaEngine'

const CELL_WIDTH = 72
const LABEL_WIDTH = 160
const PRODUCT_HEADER_HEIGHT = 32
const CELL_HEIGHT = 28

export default function PSIGrid() {
  const { products, fetchProducts, weeks, currentWeekIndex, fetchWeeks,
    psiData, fetchPSIData, updateCell, setPSIDataLocal, setNotification } = useStore()
  const [searchParams] = useSearchParams()
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const scrollContainerRef = useRef(null)
  const headerScrollRef = useRef(null)
  const debounceTimers = useRef({})

  // Load weeks and products on mount
  useEffect(() => {
    const init = async () => {
      await fetchWeeks()
      await fetchProducts(Object.fromEntries(searchParams))
      setLoaded(true)
    }
    init()
  }, [])

  // When products change, fetch PSI data
  useEffect(() => {
    if (products.length > 0 && weeks.length > 0) {
      const ids = products.map(p => p.id)
      fetchPSIData(ids)
    }
  }, [products, weeks])

  // Scroll sync between header and body
  const handleBodyScroll = useCallback((e) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = e.target.scrollLeft
    }
  }, [])

  // Auto-scroll to current week on load
  useEffect(() => {
    if (loaded && scrollContainerRef.current && currentWeekIndex > 0) {
      const scrollTo = Math.max(0, (currentWeekIndex - 2) * CELL_WIDTH)
      scrollContainerRef.current.scrollLeft = scrollTo
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = scrollTo
      }
    }
  }, [loaded, currentWeekIndex])

  // Build week data for a product
  const buildWeekData = useCallback((productId) => {
    const data = psiData[productId] || {}
    return weeks.map(w => {
      const obj = { year: w.year, week: w.week, key: w.key }
      for (const m of METRIC_ORDER) {
        obj[m] = data[m]?.[w.key] ?? null
      }
      return obj
    })
  }, [psiData, weeks])

  // Group weeks by year and month for 3-level header
  const monthGroups = useMemo(() => {
    if (!weeks.length) return []
    const groups = []
    let current = null
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]
      const key = `${w.year}_${w.month}`
      if (!current || current.key !== key) {
        current = { key, year: w.year, month: w.month, monthName: w.monthName, count: 1 }
        groups.push(current)
      } else {
        current.count++
      }
    }
    return groups
  }, [weeks])

  const yearGroups = useMemo(() => {
    if (!weeks.length) return []
    const groups = []
    let current = null
    for (let i = 0; i < weeks.length; i++) {
      if (!current || current.year !== weeks[i].year) {
        current = { year: weeks[i].year, count: 1 }
        groups.push(current)
      } else {
        current.count++
      }
    }
    return groups
  }, [weeks])

  // Handle cell edit
  const handleCellClick = (productId, metric, weekKey) => {
    if (!MANUAL_METRICS.has(metric)) return
    const week = weeks.find(w => w.key === weekKey)
    if (week?.isPast) return
    setEditingCell({ productId, metric, weekKey })
    const val = psiData[productId]?.[metric]?.[weekKey]
    setEditValue(val !== null && val !== undefined ? String(val) : '')
  }

  const handleCellSave = useCallback((productId, metric, weekKey, value) => {
    const numValue = value === '' ? 0 : parseFloat(value)
    if (isNaN(numValue)) return

    // Update local state immediately
    const data = psiData[productId] || {}
    const metricData = { ...data[metric], [weekKey]: numValue }
    setPSIDataLocal(productId, { [metric]: metricData })

    // Recalculate dependent metrics locally
    const product = products.find(p => p.id === productId)
    const weekData = buildWeekData(productId)
    // Apply the new value
    const wIdx = weeks.findIndex(w => w.key === weekKey)
    if (wIdx >= 0) weekData[wIdx][metric] = numValue
    const recalculated = recalculateProduct(weekData, currentWeekIndex, product?.moq || 1)

    // Update all calculated metrics locally
    const updates = {}
    for (const m of ['availability', 'inventory_client', 'stock_days_terg', 'stock_days_ttl', 'demand']) {
      updates[m] = {}
      for (let i = currentWeekIndex; i < recalculated.length; i++) {
        updates[m][weeks[i].key] = recalculated[i][m]
      }
    }
    setPSIDataLocal(productId, { ...metricData ? { [metric]: metricData } : {}, ...updates })

    // Debounced save to server
    const timerKey = `${productId}_${metric}_${weekKey}`
    if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey])
    debounceTimers.current[timerKey] = setTimeout(async () => {
      const result = await updateCell(productId, metric, weekKey, numValue)
      if (result.success) {
        // Optionally refetch to sync calculated values from server
      }
      delete debounceTimers.current[timerKey]
    }, 500)
  }, [psiData, products, weeks, currentWeekIndex, buildWeekData, setPSIDataLocal, updateCell])

  const handleKeyDown = (e, productId, metric, weekKey) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      handleCellSave(productId, metric, weekKey, editValue)
      setEditingCell(null)

      // Move to next editable cell
      if (e.key === 'Tab') {
        const wIdx = weeks.findIndex(w => w.key === weekKey)
        const nextWeek = weeks[wIdx + (e.shiftKey ? -1 : 1)]
        if (nextWeek && !nextWeek.isPast) {
          handleCellClick(productId, metric, nextWeek.key)
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter Panel */}
      <FilterPanel />

      {/* Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 3-level header */}
        <div className="flex shrink-0 border-b border-slate-600">
          {/* Frozen label column header */}
          <div className="shrink-0 bg-slate-800 z-20 border-r border-slate-600" style={{ width: LABEL_WIDTH }}>
            <div className="psi-header-cell" style={{ height: CELL_HEIGHT }}>Year</div>
            <div className="psi-header-cell" style={{ height: CELL_HEIGHT }}>Month</div>
            <div className="psi-header-cell" style={{ height: CELL_HEIGHT }}>Week</div>
          </div>

          {/* Scrollable week headers */}
          <div ref={headerScrollRef} className="flex-1 overflow-hidden no-scrollbar">
            <div style={{ width: weeks.length * CELL_WIDTH }}>
              {/* Year row */}
              <div className="flex">
                {yearGroups.map((g, i) => (
                  <div key={i} className="psi-header-cell bg-slate-700 border-b border-slate-500"
                    style={{ width: g.count * CELL_WIDTH, height: CELL_HEIGHT }}>
                    {g.year}
                  </div>
                ))}
              </div>
              {/* Month row */}
              <div className="flex">
                {monthGroups.map((g, i) => (
                  <div key={i} className="psi-header-cell bg-slate-750 border-b border-slate-500"
                    style={{ width: g.count * CELL_WIDTH, height: CELL_HEIGHT, backgroundColor: '#2d3a4f' }}>
                    {g.monthName}
                  </div>
                ))}
              </div>
              {/* Week row */}
              <div className="flex">
                {weeks.map((w, i) => (
                  <div key={w.key}
                    className={`psi-header-cell ${w.isCurrent ? 'bg-blue-800 text-blue-100' : 'bg-slate-700'}`}
                    style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}>
                    W{w.week}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Body: products with metric rows */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto scrollbar-thin"
          onScroll={handleBodyScroll}
        >
          {products.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-500">
              No products found. Try adjusting your filters or import products first.
            </div>
          ) : (
            <div style={{ minWidth: LABEL_WIDTH + weeks.length * CELL_WIDTH }}>
              {products.map((product) => (
                <ProductBlock
                  key={product.id}
                  product={product}
                  weeks={weeks}
                  currentWeekIndex={currentWeekIndex}
                  psiData={psiData[product.id] || {}}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onCellClick={handleCellClick}
                  onCellSave={handleCellSave}
                  onKeyDown={handleKeyDown}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Product block: header + 13 metric rows
const ProductBlock = React.memo(function ProductBlock({
  product, weeks, currentWeekIndex, psiData, editingCell, editValue,
  setEditValue, onCellClick, onCellSave, onKeyDown
}) {
  return (
    <div className="border-b-2 border-slate-600">
      {/* Product header */}
      <div className="psi-product-header" style={{ minWidth: LABEL_WIDTH + weeks.length * CELL_WIDTH }}>
        <span className="font-mono text-blue-300">{product.item_number}</span>
        <span className="text-slate-200 font-medium">{product.model}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${product.brand === 'HSN' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>
          {product.brand}
        </span>
        {product.category_1 && <span className="text-slate-500 text-[10px]">{product.category_1}</span>}
        {product.moq > 1 && <span className="text-slate-500 text-[10px]">MOQ: {product.moq}</span>}
      </div>

      {/* 13 metric rows */}
      {METRIC_ORDER.map((metric) => (
        <div key={metric} className={`flex ${getMetricRowStyle(metric)}`}>
          {/* Frozen label */}
          <div className={`psi-label-cell sticky left-0 z-10 ${getMetricRowStyle(metric)} ${getMetricLabelStyle(metric)} border-r border-slate-600`}
            style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }}>
            {METRIC_LABELS[metric]}
          </div>

          {/* Week cells */}
          {weeks.map((w, wIdx) => {
            const value = psiData[metric]?.[w.key] ?? null
            const isEditing = editingCell?.productId === product.id &&
              editingCell?.metric === metric && editingCell?.weekKey === w.key
            const isEditable = MANUAL_METRICS.has(metric) && !w.isPast
            const isStockDays = metric === 'stock_days_terg' || metric === 'stock_days_ttl'
            const stockDaysClass = isStockDays ? getStockDaysColor(value) : ''
            const isDemandFrozen = metric === 'demand' && value === 1

            return (
              <div
                key={w.key}
                className={`psi-cell ${isEditable ? 'psi-cell-editable' : ''} ${
                  w.isCurrent ? 'bg-blue-900/20 border-blue-700' : ''
                } ${stockDaysClass} ${isDemandFrozen ? 'text-slate-600 italic' : ''}`}
                style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                onClick={() => isEditable && onCellClick(product.id, metric, w.key)}
              >
                {isEditing ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      onCellSave(product.id, metric, w.key, editValue)
                      // Clear editing after blur
                    }}
                    onKeyDown={(e) => onKeyDown(e, product.id, metric, w.key)}
                    className="w-full h-full bg-slate-900 text-slate-100 text-xs text-right px-1 outline-none border-none"
                    autoFocus
                  />
                ) : (
                  <span className="text-xs truncate">
                    {formatValue(metric, value)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
})
