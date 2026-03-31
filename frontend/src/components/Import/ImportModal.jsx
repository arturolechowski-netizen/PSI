import React, { useState, useRef } from 'react'
import client from '../../api/client'
import useStore from '../../store/useStore'

export default function ImportModal({ importType, onClose, onComplete }) {
  const { setNotification } = useStore()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importLogId, setImportLogId] = useState(null)
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const fileInputRef = useRef()

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) {
      setFile(f)
      setPreview(null)
      setImportLogId(null)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      setFile(f)
      setPreview(null)
      setImportLogId(null)
    }
  }

  const handlePreview = async () => {
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await client.post(importType.endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setPreview(res.data.preview)
      setImportLogId(res.data.importLogId)
      setTotalRows(res.data.totalRows)
    } catch (err) {
      setNotification(err.message || 'Failed to parse file', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!importLogId) return
    setConfirming(true)
    try {
      const res = await client.post(`/imports/confirm/${importLogId}`)
      setNotification(`Import confirmed: ${res.data.recordsAffected} records`, 'success')
      onComplete()
    } catch (err) {
      setNotification(err.message || 'Import failed', 'error')
    } finally {
      setConfirming(false)
    }
  }

  const previewColumns = preview?.length > 0 ? Object.keys(preview[0]) : []

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">{importType.label}</h2>
            <p className="text-xs text-slate-500">{importType.desc}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer mb-4"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
            {file ? (
              <div>
                <p className="text-sm text-slate-200 font-medium">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-slate-400 text-sm">Drop Excel file here or click to browse</p>
                <p className="text-xs text-slate-600 mt-1">Supports .xlsx, .xls, .csv</p>
              </div>
            )}
          </div>

          {/* Preview button */}
          {file && !preview && (
            <button
              onClick={handlePreview}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm text-white font-medium mb-4"
            >
              {loading ? 'Parsing...' : 'Preview Import'}
            </button>
          )}

          {/* Preview table */}
          {preview && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-slate-300">{totalRows} rows parsed</span>
                <span className="text-xs text-slate-500">(showing first {preview.length})</span>
              </div>
              <div className="overflow-auto max-h-64 border border-slate-700 rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-700">
                      {previewColumns.map(col => (
                        <th key={col} className="px-2 py-1.5 text-left text-slate-300 font-medium whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-t border-slate-700">
                        {previewColumns.map(col => (
                          <td key={col} className="px-2 py-1 text-slate-400 whitespace-nowrap">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">
            Cancel
          </button>
          {preview && (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 rounded text-sm text-white font-medium"
            >
              {confirming ? 'Importing...' : `Confirm Import (${totalRows} rows)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
