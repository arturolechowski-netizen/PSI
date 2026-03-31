import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useStore from '../../store/useStore'
import client from '../../api/client'

export default function FilterPanel() {
  const { products, fetchProducts, filters, setFilters, resetFilters, productsMeta } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterOptions, setFilterOptions] = useState({})
  const [expanded, setExpanded] = useState(false)

  // Load filter options
  useEffect(() => {
    client.get('/products/filters').then(res => {
      setFilterOptions(res.data)
    }).catch(() => {})
  }, [])

  // Sync URL params to filters on mount
  useEffect(() => {
    const params = Object.fromEntries(searchParams)
    if (Object.keys(params).length > 0) {
      setFilters(params)
    }
  }, [])

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)

    // Update URL
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(newFilters)) {
      if (v) params.set(k, v)
    }
    setSearchParams(params, { replace: true })

    // Fetch
    fetchProducts(newFilters)
  }

  const handleReset = () => {
    resetFilters()
    setSearchParams({}, { replace: true })
    fetchProducts({})
  }

  const total = productsMeta?.total || products.length

  return (
    <div className="bg-slate-800 border-b border-slate-700 px-4 py-2">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1"
        >
          <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          Filters
        </button>

        {/* Quick search */}
        <input
          type="text"
          placeholder="Search item number, model..."
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 w-64 focus:outline-none focus:border-blue-500"
        />

        {/* Brand quick filter */}
        <div className="flex gap-1">
          {['', 'GOR', 'HSN'].map(b => (
            <button
              key={b}
              onClick={() => handleFilterChange('brand', b)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filters.brand === b
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {b || 'All'}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 ml-auto">
          {products.length} of {total} products
        </span>

        {(filters.search || filters.brand || filters.category_1) && (
          <button onClick={handleReset} className="text-xs text-red-400 hover:text-red-300">
            Reset
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-6 gap-2">
          <FilterSelect
            label="Category 1"
            value={filters.category_1}
            options={filterOptions.category_1 || []}
            onChange={(v) => handleFilterChange('category_1', v)}
          />
          <FilterSelect
            label="Category 2"
            value={filters.category_2}
            options={filterOptions.category_2 || []}
            onChange={(v) => handleFilterChange('category_2', v)}
          />
          <FilterSelect
            label="Category 3"
            value={filters.category_3}
            options={filterOptions.category_3 || []}
            onChange={(v) => handleFilterChange('category_3', v)}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            options={filterOptions.statuses || []}
            onChange={(v) => handleFilterChange('status', v)}
          />
          <FilterSelect
            label="Description"
            value={filters.description}
            options={filterOptions.descriptions || []}
            onChange={(v) => handleFilterChange('description', v)}
          />
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
