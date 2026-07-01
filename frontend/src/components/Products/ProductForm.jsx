import React, { useState } from 'react'
import useStore from '../../store/useStore'

const emptyProduct = {
  item_number: '', model: '', ean: '', brand: 'GOR', manufacturer: '',
  description: '', status: '', category_1: '', category_2: '', category_3: '',
  category_4: '', category_5: '', moq: 1
}

export default function ProductForm({ product, onClose }) {
  const { createProduct, updateProduct } = useStore()
  const [form, setForm] = useState(product || emptyProduct)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!product

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.item_number || !form.model || !form.brand) {
      setError('Item number, model, and brand are required')
      return
    }
    setSaving(true)
    const data = { ...form, item_number: parseInt(form.item_number), moq: parseInt(form.moq) || 1 }
    const result = isEdit
      ? await updateProduct(product.id, data)
      : await createProduct(data)
    setSaving(false)
    if (result.success) {
      onClose(true)
    } else {
      setError(result.error || 'Failed to save')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => onClose(false)}>
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={() => onClose(false)} className="text-slate-500 hover:text-slate-300 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && <div className="mb-4 px-3 py-2 bg-red-900/50 border border-red-800 rounded text-red-300 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Item Number *" type="number"
              value={form.item_number} onChange={v => handleChange('item_number', v)} disabled={isEdit} />
            <Field label="Model *" value={form.model} onChange={v => handleChange('model', v)} />
            <Field label="EAN" value={form.ean} onChange={v => handleChange('ean', v)} />
            <div>
              <label className="text-xs text-slate-500 block mb-1">Brand *</label>
              <select value={form.brand} onChange={e => handleChange('brand', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                <option value="GOR">GOR (Gorenje)</option>
                <option value="HSN">HSN (Hisense)</option>
              </select>
            </div>
            <Field label="Manufacturer" value={form.manufacturer} onChange={v => handleChange('manufacturer', v)} />
            <Field label="Description" value={form.description} onChange={v => handleChange('description', v)} />
            <Field label="Status" value={form.status} onChange={v => handleChange('status', v)} />
            <Field label="MOQ" type="number" value={form.moq} onChange={v => handleChange('moq', v)} />
          </div>

          <h3 className="text-sm font-medium text-slate-400 mt-5 mb-3">Category Hierarchy</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category 1" value={form.category_1} onChange={v => handleChange('category_1', v)} />
            <Field label="Category 2" value={form.category_2} onChange={v => handleChange('category_2', v)} />
            <Field label="Category 3" value={form.category_3} onChange={v => handleChange('category_3', v)} />
            <Field label="Category 4" value={form.category_4} onChange={v => handleChange('category_4', v)} />
            <Field label="Category 5" value={form.category_5} onChange={v => handleChange('category_5', v)} />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => onClose(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm text-white font-medium">
              {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50" />
    </div>
  )
}
