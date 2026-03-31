import React, { useEffect, useState } from 'react'
import client from '../../api/client'

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1 })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ product_id: '', user_id: '', metric_type: '', start_date: '', end_date: '' })
  const [page, setPage] = useState(1)

  const fetchLogs = () => {
    setLoading(true)
    const params = { ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)), page, pageSize: 100 }
    client.get('/audit', { params })
      .then(res => { setLogs(res.data.logs); setMeta(res.data.meta) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLogs() }, [page])

  const handleExport = () => {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([,v]) => v))
    )
    window.open(`/api/exports/audit?${params}`, '_blank')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-200">Audit Log</h1>
        <button onClick={handleExport} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">
          Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="Product ID" value={filters.product_id}
          onChange={e => setFilters({...filters, product_id: e.target.value})}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 w-32 focus:outline-none focus:border-blue-500" />
        <select value={filters.metric_type} onChange={e => setFilters({...filters, metric_type: e.target.value})}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500">
          <option value="">All Metrics</option>
          {['availability','goods_on_way','confirmed_production','demand','sell_in','order_client','sell_out_kam','sell_out_report','inventory_client','stock_days_terg','shops_report','shops_target','stock_days_ttl'].map(m =>
            <option key={m} value={m}>{m}</option>
          )}
        </select>
        <input type="date" value={filters.start_date}
          onChange={e => setFilters({...filters, start_date: e.target.value})}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
        <input type="date" value={filters.end_date}
          onChange={e => setFilters({...filters, end_date: e.target.value})}
          className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500" />
        <button onClick={() => { setPage(1); fetchLogs() }}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white">Filter</button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-slate-500 text-sm">No audit entries found.</div>
      ) : (
        <>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Old</th>
                  <th className="px-3 py-2">New</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-b border-slate-800 text-slate-300">
                    <td className="px-3 py-2">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{l.user_name}</td>
                    <td className="px-3 py-2 font-mono text-blue-300">{l.item_number} {l.model && `(${l.model})`}</td>
                    <td className="px-3 py-2">{l.metric_type}</td>
                    <td className="px-3 py-2">{l.year && `${l.year}/W${l.week}`}</td>
                    <td className="px-3 py-2 text-red-400">{l.old_value}</td>
                    <td className="px-3 py-2 text-green-400">{l.new_value}</td>
                    <td className="px-3 py-2">{l.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-4 justify-center text-xs">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="px-3 py-1 bg-slate-700 text-slate-300 rounded disabled:opacity-50">Prev</button>
            <span className="text-slate-500 py-1">Page {meta.page} ({meta.total} entries)</span>
            <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 100}
              className="px-3 py-1 bg-slate-700 text-slate-300 rounded disabled:opacity-50">Next</button>
          </div>
        </>
      )}
    </div>
  )
}
