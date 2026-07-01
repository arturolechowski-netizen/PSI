import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { getStockDaysColor } from '../../utils/formulaEngine'

export default function StockDaysHeatmap() {
  const [data, setData] = useState({ products: [], weeks: [] })
  const [loading, setLoading] = useState(true)
  const [sortAsc, setSortAsc] = useState(true)
  const [brandFilter, setBrandFilter] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    const params = brandFilter ? { brand: brandFilter } : {}
    client.get('/dashboard/stock-days-heatmap', { params })
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [brandFilter])

  const sortedProducts = [...data.products].sort((a, b) => {
    const aVal = Object.values(a.weeks)[0] ?? 999
    const bVal = Object.values(b.weeks)[0] ?? 999
    return sortAsc ? aVal - bVal : bVal - aVal
  })

  if (loading) {
    return <div className="text-slate-500 py-8 text-center">Loading heatmap...</div>
  }

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="flex gap-1">
          {['', 'GOR', 'HSN'].map(b => (
            <button key={b} onClick={() => setBrandFilter(b)}
              className={`px-2 py-1 text-xs rounded ${brandFilter === b ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {b || 'All'}
            </button>
          ))}
        </div>
        <button onClick={() => setSortAsc(!sortAsc)}
          className="px-2 py-1 text-xs bg-slate-700 text-slate-400 rounded hover:bg-slate-600">
          Sort {sortAsc ? '↑' : '↓'}
        </button>
        <div className="flex gap-2 ml-auto text-[10px] items-center">
          <span className="px-2 py-0.5 bg-green-900/70 text-green-200 rounded">60-120d</span>
          <span className="px-2 py-0.5 bg-yellow-900/70 text-yellow-200 rounded">30-60 / 120-180d</span>
          <span className="px-2 py-0.5 bg-red-900/70 text-red-200 rounded">&lt;30 / &gt;180d</span>
        </div>
      </div>

      {sortedProducts.length === 0 ? (
        <div className="text-slate-500 py-8 text-center">No stock days data available.</div>
      ) : (
        <div className="overflow-auto scrollbar-thin">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-800 px-3 py-2 text-left text-slate-400 font-medium border border-slate-600 min-w-[200px]">
                  Product
                </th>
                {data.weeks.map(w => (
                  <th key={w.key} className="px-3 py-2 text-center text-slate-400 font-medium border border-slate-600 bg-slate-800 min-w-[70px]">
                    W{w.week}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => navigate(`/grid?search=${p.item_number}`)}>
                  <td className="sticky left-0 bg-slate-800 px-3 py-1.5 border border-slate-600 text-slate-300 whitespace-nowrap">
                    <span className="font-mono text-blue-300">{p.item_number}</span>
                    <span className="ml-2">{p.model}</span>
                  </td>
                  {data.weeks.map(w => {
                    const val = p.weeks[w.key]
                    return (
                      <td key={w.key} className={`px-2 py-1.5 text-center border border-slate-600 font-mono ${getStockDaysColor(val)}`}>
                        {val !== null && val !== undefined ? Math.round(val) : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
