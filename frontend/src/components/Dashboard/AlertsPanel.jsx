import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'

const severityConfig = {
  high: { bg: 'bg-red-900/30 border-red-800', badge: 'bg-red-600 text-white', label: 'High' },
  medium: { bg: 'bg-yellow-900/30 border-yellow-800', badge: 'bg-yellow-600 text-white', label: 'Medium' },
  low: { bg: 'bg-blue-900/30 border-blue-800', badge: 'bg-blue-600 text-white', label: 'Low' },
}

const typeIcons = {
  stockout_risk: '⚠',
  overstock: '▲',
  no_demand: '○',
  missing_data: '?',
}

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    client.get('/dashboard/alerts')
      .then(res => setAlerts(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = filterSeverity
    ? alerts.filter(a => a.severity === filterSeverity)
    : alerts

  const grouped = {
    high: filtered.filter(a => a.severity === 'high'),
    medium: filtered.filter(a => a.severity === 'medium'),
    low: filtered.filter(a => a.severity === 'low'),
  }

  if (loading) return <div className="text-slate-500 py-8 text-center">Loading alerts...</div>

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center">
        <span className="text-sm text-slate-400">{alerts.length} alerts</span>
        <div className="flex gap-1">
          {['', 'high', 'medium', 'low'].map(s => (
            <button key={s} onClick={() => setFilterSeverity(s)}
              className={`px-2 py-1 text-xs rounded ${filterSeverity === s ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-slate-500 py-16 text-center">No alerts at this time.</div>
      ) : (
        <div className="space-y-2">
          {['high', 'medium', 'low'].map(severity => {
            const items = grouped[severity]
            if (items.length === 0) return null
            const config = severityConfig[severity]

            return (
              <div key={severity}>
                <h3 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${config.badge}`}>{config.label}</span>
                  <span className="text-slate-600">({items.length})</span>
                </h3>
                <div className="space-y-1">
                  {items.map((alert, i) => (
                    <div key={i}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${config.bg}`}
                      onClick={() => navigate(`/grid?search=${alert.item_number}`)}>
                      <span className="text-lg w-6 text-center">{typeIcons[alert.type] || '!'}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-blue-300 text-xs">{alert.item_number}</span>
                          <span className="text-sm text-slate-200">{alert.product_model}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{alert.message}</p>
                      </div>
                      <span className="text-xs text-slate-500">W{alert.week}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
