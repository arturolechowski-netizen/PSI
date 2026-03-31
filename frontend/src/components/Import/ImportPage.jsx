import React, { useEffect, useState } from 'react'
import client from '../../api/client'
import useStore from '../../store/useStore'
import ImportModal from './ImportModal'

const importTypes = [
  { key: 'container-table', label: 'Container Table', desc: 'Goods on the Way — China origin shipments', endpoint: '/imports/container-table' },
  { key: 'production-plan', label: 'Production Plan', desc: 'Confirmed Production — European factories', endpoint: '/imports/production-plan' },
  { key: 'sell-out-report', label: 'Sell Out Report', desc: 'Polygram — POS sell-out, inventory, shops', endpoint: '/imports/sell-out-report' },
  { key: 'stock-report', label: 'Stock Report', desc: 'SBU + PC warehouse stock levels', endpoint: '/imports/stock-report' },
  { key: 'moq', label: 'MOQ Table', desc: 'Minimum order quantities per product', endpoint: '/imports/moq' },
  { key: 'fp-ibp', label: 'FP/IBP Forecast', desc: 'Demand forecast baseline', endpoint: '/imports/fp-ibp' },
  { key: 'products', label: 'Bulk Products', desc: 'Product master data from PSI_KAM Excel', endpoint: '/imports/products' },
]

export default function ImportPage() {
  const { setNotification } = useStore()
  const [history, setHistory] = useState([])
  const [activeImport, setActiveImport] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = () => {
    setHistoryLoading(true)
    client.get('/imports/history')
      .then(res => setHistory(res.data))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => { loadHistory() }, [])

  const handleImportComplete = () => {
    setActiveImport(null)
    loadHistory()
    setNotification('Import completed successfully', 'success')
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-slate-200 mb-4">Data Import</h1>

      {/* Import type cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
        {importTypes.map(type => {
          const lastImport = history.find(h => h.source_type === type.key.replace(/-/g, '_'))
          return (
            <div key={type.key} className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors">
              <h3 className="text-sm font-semibold text-slate-200 mb-1">{type.label}</h3>
              <p className="text-xs text-slate-500 mb-3">{type.desc}</p>
              {lastImport && (
                <p className="text-[10px] text-slate-600 mb-2">
                  Last: {new Date(lastImport.created_at).toLocaleDateString()} · {lastImport.records_affected} records
                </p>
              )}
              <button
                onClick={() => setActiveImport(type)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white font-medium transition-colors"
              >
                Upload
              </button>
            </div>
          )
        })}
      </div>

      {/* Import history */}
      <h2 className="text-lg font-semibold text-slate-300 mb-3">Import History</h2>
      {historyLoading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : history.length === 0 ? (
        <div className="text-slate-500 text-sm">No imports yet.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-700">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Records</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-slate-800 text-slate-300">
                  <td className="px-3 py-2">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{h.source_type}</td>
                  <td className="px-3 py-2 truncate max-w-[200px]">{h.file_name}</td>
                  <td className="px-3 py-2">{h.records_affected}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      h.status === 'confirmed' ? 'bg-green-900 text-green-300' :
                      h.status === 'failed' ? 'bg-red-900 text-red-300' :
                      'bg-yellow-900 text-yellow-300'
                    }`}>{h.status}</span>
                  </td>
                  <td className="px-3 py-2">{h.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import modal */}
      {activeImport && (
        <ImportModal
          importType={activeImport}
          onClose={() => setActiveImport(null)}
          onComplete={handleImportComplete}
        />
      )}
    </div>
  )
}
