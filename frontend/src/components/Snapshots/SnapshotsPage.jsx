import React, { useEffect, useState } from 'react'
import useStore from '../../store/useStore'

export default function SnapshotsPage() {
  const { snapshots, snapshotsLoading, fetchSnapshots, createSnapshot, deleteSnapshot, compareSnapshots, setNotification, user } = useStore()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [comparison, setComparison] = useState(null)
  const [comparing, setComparing] = useState(false)

  useEffect(() => { fetchSnapshots() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const result = await createSnapshot(newName.trim())
    setCreating(false)
    if (result.success) {
      setNewName('')
      fetchSnapshots()
    }
  }

  const handleDelete = async (id) => {
    const result = await deleteSnapshot(id)
    if (result.success) fetchSnapshots()
  }

  const handleCompare = async () => {
    if (!compareA || !compareB || compareA === compareB) {
      setNotification('Select two different snapshots', 'error')
      return
    }
    setComparing(true)
    const result = await compareSnapshots(compareA, compareB)
    setComparing(false)
    if (result.success) setComparison(result.data)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-slate-200 mb-4">Snapshots</h1>

      {/* Create snapshot */}
      <div className="flex gap-3 mb-6">
        <input
          type="text" placeholder="Snapshot name..."
          value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 w-64 focus:outline-none focus:border-blue-500"
        />
        <button onClick={handleCreate} disabled={creating || !newName.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm text-white font-medium">
          {creating ? 'Creating...' : 'Take Snapshot'}
        </button>
      </div>

      {/* Snapshots list */}
      {snapshotsLoading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-slate-500 text-sm">No snapshots yet.</div>
      ) : (
        <div className="overflow-auto mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-slate-700">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Created By</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Records</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.id} className="border-b border-slate-800 text-slate-300">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-xs">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">{s.created_by_name}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.is_auto ? 'bg-slate-700 text-slate-400' : 'bg-blue-900 text-blue-300'}`}>
                      {s.is_auto ? 'Auto' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{s.data_count}</td>
                  <td className="px-3 py-2">
                    {user?.role === 'admin' && (
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Compare */}
      {snapshots.length >= 2 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-300 mb-3">Compare Snapshots</h2>
          <div className="flex gap-3 mb-4 items-end">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Snapshot A</label>
              <select value={compareA} onChange={e => setCompareA(e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200">
                <option value="">Select...</option>
                {snapshots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Snapshot B</label>
              <select value={compareB} onChange={e => setCompareB(e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200">
                <option value="">Select...</option>
                {snapshots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button onClick={handleCompare} disabled={comparing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm text-white font-medium">
              {comparing ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {comparison && (
            <div className="overflow-auto max-h-96 border border-slate-700 rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-slate-700">
                    <th className="px-2 py-1.5 text-left text-slate-300">Product</th>
                    <th className="px-2 py-1.5 text-left text-slate-300">Metric</th>
                    <th className="px-2 py-1.5 text-center text-slate-300">Week</th>
                    <th className="px-2 py-1.5 text-right text-slate-300">Value A</th>
                    <th className="px-2 py-1.5 text-right text-slate-300">Value B</th>
                    <th className="px-2 py-1.5 text-right text-slate-300">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.deltas.slice(0, 500).map((d, i) => {
                    const delta = (parseFloat(d.value_b) || 0) - (parseFloat(d.value_a) || 0)
                    return (
                      <tr key={i} className="border-t border-slate-700">
                        <td className="px-2 py-1 text-slate-400">{d.item_number} {d.model}</td>
                        <td className="px-2 py-1 text-slate-400">{d.metric_type}</td>
                        <td className="px-2 py-1 text-center text-slate-400">W{d.week}</td>
                        <td className="px-2 py-1 text-right">{d.value_a}</td>
                        <td className="px-2 py-1 text-right">{d.value_b}</td>
                        <td className={`px-2 py-1 text-right font-medium ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {comparison.deltas.length > 500 && (
                <p className="text-xs text-slate-500 p-2 text-center">Showing first 500 of {comparison.deltas.length} changes</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
