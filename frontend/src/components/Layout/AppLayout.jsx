import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import useStore from '../../store/useStore'

const navItems = [
  { to: '/grid', label: 'PSI Grid', icon: '▦' },
  { to: '/dashboard', label: 'Dashboard', icon: '◎' },
  { to: '/imports', label: 'Imports', icon: '↑' },
  { to: '/products', label: 'Products', icon: '☰' },
  { to: '/snapshots', label: 'Snapshots', icon: '⊞' },
]

const adminItems = [
  { to: '/audit', label: 'Audit Log', icon: '⊘' },
  { to: '/users', label: 'Users', icon: '⊕' },
]

const roleBadgeColors = {
  admin: 'bg-red-900 text-red-200',
  planner: 'bg-blue-900 text-blue-200',
  kam: 'bg-green-900 text-green-200',
  viewer: 'bg-slate-700 text-slate-300',
}

export default function AppLayout() {
  const { user, logout, notification, clearNotification } = useStore()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold text-blue-400 tracking-wide">PSI</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Purchase · Stock · Inventory</p>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-900/40 text-blue-300 border-r-2 border-blue-400'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <>
              <div className="mx-4 my-2 border-t border-slate-700" />
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-900/40 text-blue-300 border-r-2 border-blue-400'
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`
                  }
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold text-slate-300">
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{user?.name}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${roleBadgeColors[user?.role] || ''}`}>
                {user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-xs text-slate-500 hover:text-red-400 transition-colors py-1"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-lg shadow-xl border text-sm cursor-pointer transition-all ${
            notification.type === 'error'
              ? 'bg-red-900/90 border-red-700 text-red-200'
              : notification.type === 'success'
              ? 'bg-green-900/90 border-green-700 text-green-200'
              : 'bg-blue-900/90 border-blue-700 text-blue-200'
          }`}
          onClick={clearNotification}
        >
          {notification.message}
        </div>
      )}
    </div>
  )
}
