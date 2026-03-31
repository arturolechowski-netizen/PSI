import React, { useEffect, useState } from 'react'
import useStore from '../../store/useStore'

const roleBadgeColors = {
  admin: 'bg-red-900 text-red-200',
  planner: 'bg-blue-900 text-blue-200',
  kam: 'bg-green-900 text-green-200',
  viewer: 'bg-slate-700 text-slate-300',
}

export default function UsersPage() {
  const { users, usersLoading, fetchUsers, createUser, updateUser, setNotification } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchUsers() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    let result
    if (editingUser) {
      const data = { name: form.name, role: form.role }
      if (form.password) data.password = form.password
      result = await updateUser(editingUser.id, data)
    } else {
      if (!form.email || !form.password || !form.name) {
        setNotification('All fields are required', 'error')
        setSaving(false)
        return
      }
      result = await createUser(form)
    }
    setSaving(false)
    if (result.success) {
      setShowForm(false)
      setEditingUser(null)
      setForm({ name: '', email: '', password: '', role: 'viewer' })
      fetchUsers()
    }
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setForm({ name: user.name, email: user.email, password: '', role: user.role })
    setShowForm(true)
  }

  const handleToggleActive = async (user) => {
    await updateUser(user.id, { is_active: !user.is_active })
    fetchUsers()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-200">User Management</h1>
        <button
          onClick={() => { setEditingUser(null); setForm({ name: '', email: '', password: '', role: 'viewer' }); setShowForm(true) }}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white font-medium"
        >
          + Add User
        </button>
      </div>

      {usersLoading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs border-b border-slate-700">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-800 text-slate-300">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{u.email}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleBadgeColors[u.role] || ''}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.is_active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 flex gap-2">
                  <button onClick={() => handleEdit(u)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                  <button onClick={() => handleToggleActive(u)}
                    className={`text-xs ${u.is_active ? 'text-red-500 hover:text-red-400' : 'text-green-500 hover:text-green-400'}`}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* User form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Name</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
              </div>
              {!editingUser && (
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 block mb-1">{editingUser ? 'New Password (leave empty to keep)' : 'Password'}</label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                  required={!editingUser} minLength={6}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                  <option value="admin">Admin</option>
                  <option value="planner">Planner</option>
                  <option value="kam">KAM</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded text-sm text-white font-medium">
                  {saving ? 'Saving...' : (editingUser ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
