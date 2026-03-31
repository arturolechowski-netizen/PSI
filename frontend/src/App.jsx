import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useStore from './store/useStore'
import AppLayout from './components/Layout/AppLayout'
import LoginPage from './components/Auth/LoginPage'
import PSIGrid from './components/Grid/PSIGrid'
import DashboardPage from './components/Dashboard/DashboardPage'
import ImportPage from './components/Import/ImportPage'
import ProductsPage from './components/Products/ProductsPage'
import SnapshotsPage from './components/Snapshots/SnapshotsPage'
import AuditPage from './components/Audit/AuditPage'
import UsersPage from './components/Users/UsersPage'

function RequireAuth({ children }) {
  const { user, token } = useStore()
  const location = useLocation()

  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

function RequireAdmin({ children }) {
  const { user } = useStore()

  if (!user || user.role !== 'admin') {
    return <Navigate to="/grid" replace />
  }

  return children
}

function GlobalLoader() {
  const { globalLoading } = useStore()

  if (!globalLoading) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-300 text-sm font-medium">Loading...</span>
      </div>
    </div>
  )
}

export default function App() {
  const { token, setUser } = useStore()

  useEffect(() => {
    // Restore session from localStorage
    const storedToken = localStorage.getItem('psi_token')
    const storedUser = localStorage.getItem('psi_user')
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser)
        setUser(user, storedToken)
      } catch {
        localStorage.removeItem('psi_token')
        localStorage.removeItem('psi_user')
      }
    }
  }, [])

  return (
    <>
      <GlobalLoader />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/grid" replace />} />
          <Route path="grid" element={<PSIGrid />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="imports" element={<ImportPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="snapshots" element={<SnapshotsPage />} />
          <Route
            path="audit"
            element={
              <RequireAdmin>
                <AuditPage />
              </RequireAdmin>
            }
          />
          <Route
            path="users"
            element={
              <RequireAdmin>
                <UsersPage />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
