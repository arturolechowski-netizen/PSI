import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts'
import client from '../../api/client'
import useStore from '../../store/useStore'

export default function AvailabilityChart() {
  const { products, fetchProducts } = useStore()
  const [selectedProduct, setSelectedProduct] = useState('')
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (products.length === 0) fetchProducts({})
  }, [])

  useEffect(() => {
    if (!selectedProduct) return
    setLoading(true)
    client.get(`/dashboard/availability-chart/${selectedProduct}`)
      .then(res => setChartData(res.data.data || []))
      .catch(() => setChartData([]))
      .finally(() => setLoading(false))
  }, [selectedProduct])

  const filteredProducts = products.filter(p =>
    !search || String(p.item_number).includes(search) || p.model.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex gap-3 mb-4 items-end">
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">Search Product</label>
          <input
            type="text" placeholder="Item number or model..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 w-48 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">Select Product</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 w-72 focus:outline-none focus:border-blue-500"
          >
            <option value="">Choose a product...</option>
            {filteredProducts.slice(0, 100).map(p => (
              <option key={p.id} value={p.id}>{p.item_number} — {p.model}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedProduct ? (
        <div className="text-slate-500 py-16 text-center">Select a product to view its availability chart.</div>
      ) : loading ? (
        <div className="text-slate-500 py-16 text-center">Loading chart...</div>
      ) : chartData.length === 0 ? (
        <div className="text-slate-500 py-16 text-center">No data available for this product.</div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={w => `W${w}`} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                labelFormatter={w => `Week ${w}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="availability" stroke="#3b82f6" strokeWidth={2} name="Availability" dot={false} />
              <Line type="monotone" dataKey="sell_out_kam" stroke="#22c55e" strokeWidth={2} name="Sell Out KAM" dot={false} />
              <Line type="monotone" dataKey="inventory_client" stroke="#f59e0b" strokeWidth={2} name="Inventory Client" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
