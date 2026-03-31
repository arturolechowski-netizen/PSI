import React, { useEffect, useState } from 'react'
import useStore from '../../store/useStore'
import ProductForm from './ProductForm'

export default function ProductsPage() {
  const { products, fetchProducts, deleteProduct, productsMeta, setNotification } = useStore()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    fetchProducts({ search, page, pageSize: 50 })
  }, [search, page])

  const handleEdit = (product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    const result = await deleteProduct(id)
    if (result.success) {
      setConfirmDelete(null)
      fetchProducts({ search, page, pageSize: 50 })
    }
  }

  const handleFormClose = (saved) => {
    setShowForm(false)
    setEditingProduct(null)
    if (saved) fetchProducts({ search, page, pageSize: 50 })
  }

  const totalPages = Math.ceil((productsMeta?.total || 0) / 50)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-200">Products</h1>
        <button
          onClick={() => { setEditingProduct(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white font-medium"
        >
          + Add Product
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text" placeholder="Search by item number, model, EAN..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 w-80 focus:outline-none focus:border-blue-500"
        />
        <span className="ml-3 text-xs text-slate-500">{productsMeta?.total || 0} products total</span>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs border-b border-slate-700">
              <th className="px-3 py-2">Item Number</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">MOQ</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-slate-800 text-slate-300 hover:bg-slate-800/50">
                <td className="px-3 py-2 font-mono text-blue-300">{p.item_number}</td>
                <td className="px-3 py-2">{p.model}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.brand === 'HSN' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>
                    {p.brand}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{p.category_1}</td>
                <td className="px-3 py-2 text-xs">{p.status}</td>
                <td className="px-3 py-2 text-xs">{p.moq}</td>
                <td className="px-3 py-2">
                  <button onClick={() => handleEdit(p)} className="text-xs text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                  {confirmDelete === p.id ? (
                    <span className="text-xs">
                      <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300 mr-1">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-slate-500">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDelete(p.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="px-3 py-1 bg-slate-700 text-xs text-slate-300 rounded disabled:opacity-50">Prev</button>
          <span className="text-xs text-slate-500 py-1">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            className="px-3 py-1 bg-slate-700 text-xs text-slate-300 rounded disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Form modal */}
      {showForm && <ProductForm product={editingProduct} onClose={handleFormClose} />}
    </div>
  )
}
