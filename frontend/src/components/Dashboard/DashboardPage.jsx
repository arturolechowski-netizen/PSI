import React, { useState } from 'react'
import StockDaysHeatmap from './StockDaysHeatmap'
import AvailabilityChart from './AvailabilityChart'
import AlertsPanel from './AlertsPanel'

const tabs = [
  { id: 'heatmap', label: 'Stock Days Heatmap' },
  { id: 'chart', label: 'Availability Chart' },
  { id: 'alerts', label: 'Alerts' },
]

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('heatmap')

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-slate-200 mb-4">Dashboard</h1>

      <div className="flex gap-1 mb-4 border-b border-slate-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-blue-400 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'heatmap' && <StockDaysHeatmap />}
      {activeTab === 'chart' && <AvailabilityChart />}
      {activeTab === 'alerts' && <AlertsPanel />}
    </div>
  )
}
