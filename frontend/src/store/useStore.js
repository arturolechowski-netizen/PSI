import { create } from 'zustand'
import client from '../api/client'

const useStore = create((set, get) => ({
  // ─── Auth ───────────────────────────────────────────────────────────────────
  user: null,
  token: null,

  setUser: (user, token) => {
    set({ user, token })
  },

  login: async (email, password) => {
    set({ globalLoading: true })
    try {
      const res = await client.post('/auth/login', { email, password })
      const { token, user } = res.data
      localStorage.setItem('psi_token', token)
      localStorage.setItem('psi_user', JSON.stringify(user))
      set({ user, token })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      set({ globalLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('psi_token')
    localStorage.removeItem('psi_user')
    set({ user: null, token: null, psiData: {}, products: [], weeks: [] })
    window.location.href = '/login'
  },

  // ─── Global UI ──────────────────────────────────────────────────────────────
  globalLoading: false,

  notification: null,
  setNotification: (message, type = 'info') => {
    const id = Date.now()
    set({ notification: { id, message, type } })
    setTimeout(() => {
      set((state) => {
        if (state.notification?.id === id) return { notification: null }
        return {}
      })
    }, 4000)
  },
  clearNotification: () => set({ notification: null }),

  // ─── Filters ────────────────────────────────────────────────────────────────
  filters: {
    category_1: '',
    brand: '',
    status: '',
    description: '',
    search: '',
  },
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () =>
    set({
      filters: { category_1: '', brand: '', status: '', description: '', search: '' },
    }),

  // ─── Products ───────────────────────────────────────────────────────────────
  products: [],
  productsLoading: false,
  productsMeta: { total: 0, page: 1, pageSize: 50 },

  fetchProducts: async (filters = {}) => {
    set({ productsLoading: true })
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      )
      const res = await client.get('/products', { params })
      set({
        products: res.data.products || res.data,
        productsMeta: res.data.meta || { total: (res.data.products || res.data).length },
      })
    } catch (err) {
      get().setNotification(err.message, 'error')
    } finally {
      set({ productsLoading: false })
    }
  },

  createProduct: async (data) => {
    try {
      const res = await client.post('/products', data)
      get().setNotification('Product created successfully', 'success')
      return { success: true, product: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  updateProduct: async (id, data) => {
    try {
      const res = await client.put(`/products/${id}`, data)
      get().setNotification('Product updated successfully', 'success')
      return { success: true, product: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  deleteProduct: async (id) => {
    try {
      await client.delete(`/products/${id}`)
      get().setNotification('Product deleted', 'success')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  // ─── Weeks Axis ─────────────────────────────────────────────────────────────
  weeks: [],
  currentWeekIndex: 0,

  fetchWeeks: async () => {
    try {
      const res = await client.get('/psi/weeks')
      const weeks = res.data.weeks || res.data
      const currentIdx = res.data.currentWeekIndex ?? 0
      set({ weeks, currentWeekIndex: currentIdx })
      return weeks
    } catch (err) {
      get().setNotification('Failed to load weeks axis: ' + err.message, 'error')
      return []
    }
  },

  // ─── PSI Data ───────────────────────────────────────────────────────────────
  // { [productId]: { [metric]: { [year_week]: value } } }
  psiData: {},
  psiLoading: {},
  pendingEdits: {}, // { [productId_metric_yearweek]: value }

  fetchPSIData: async (productIds) => {
    if (!productIds?.length) return

    const loadingUpdate = {}
    productIds.forEach((id) => (loadingUpdate[id] = true))
    set((state) => ({ psiLoading: { ...state.psiLoading, ...loadingUpdate } }))

    try {
      const res = await client.post('/psi/batch', { productIds })
      const newData = res.data // { [productId]: { [metric]: { [year_week]: value } } }

      const doneUpdate = {}
      productIds.forEach((id) => (doneUpdate[id] = false))

      set((state) => ({
        psiData: { ...state.psiData, ...newData },
        psiLoading: { ...state.psiLoading, ...doneUpdate },
      }))
    } catch (err) {
      const doneUpdate = {}
      productIds.forEach((id) => (doneUpdate[id] = false))
      set((state) => ({ psiLoading: { ...state.psiLoading, ...doneUpdate } }))
      get().setNotification('Failed to load PSI data: ' + err.message, 'error')
    }
  },

  updateCell: async (productId, metric, yearWeek, value) => {
    // Optimistic update in store
    set((state) => {
      const existing = state.psiData[productId] || {}
      const metricData = existing[metric] || {}
      return {
        psiData: {
          ...state.psiData,
          [productId]: {
            ...existing,
            [metric]: { ...metricData, [yearWeek]: value },
          },
        },
      }
    })

    try {
      const [year, week] = yearWeek.split('_')
      await client.patch(`/psi/${productId}`, {
        metric,
        year: parseInt(year),
        week: parseInt(week),
        value,
      })
      return { success: true }
    } catch (err) {
      get().setNotification('Save failed: ' + err.message, 'error')
      return { success: false, error: err.message }
    }
  },

  updateCellsBatch: async (updates) => {
    // updates: array of { productId, metric, yearWeek, value }
    try {
      await client.post('/psi/batch-update', { updates })
      return { success: true }
    } catch (err) {
      get().setNotification('Batch save failed: ' + err.message, 'error')
      return { success: false, error: err.message }
    }
  },

  setPSIDataLocal: (productId, metricData) => {
    set((state) => ({
      psiData: {
        ...state.psiData,
        [productId]: { ...(state.psiData[productId] || {}), ...metricData },
      },
    }))
  },

  // ─── Snapshots ──────────────────────────────────────────────────────────────
  snapshots: [],
  snapshotsLoading: false,

  fetchSnapshots: async () => {
    set({ snapshotsLoading: true })
    try {
      const res = await client.get('/snapshots')
      set({ snapshots: res.data })
    } catch (err) {
      get().setNotification(err.message, 'error')
    } finally {
      set({ snapshotsLoading: false })
    }
  },

  createSnapshot: async (name) => {
    try {
      const res = await client.post('/snapshots', { name })
      get().setNotification('Snapshot created', 'success')
      return { success: true, snapshot: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  deleteSnapshot: async (id) => {
    try {
      await client.delete(`/snapshots/${id}`)
      get().setNotification('Snapshot deleted', 'success')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  compareSnapshots: async (id1, id2) => {
    try {
      const res = await client.get(`/snapshots/compare?a=${id1}&b=${id2}`)
      return { success: true, data: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  // ─── Users ──────────────────────────────────────────────────────────────────
  users: [],
  usersLoading: false,

  fetchUsers: async () => {
    set({ usersLoading: true })
    try {
      const res = await client.get('/auth/users')
      set({ users: res.data })
    } catch (err) {
      get().setNotification(err.message, 'error')
    } finally {
      set({ usersLoading: false })
    }
  },

  createUser: async (data) => {
    try {
      const res = await client.post('/auth/users', data)
      get().setNotification('User created', 'success')
      return { success: true, user: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },

  updateUser: async (id, data) => {
    try {
      const res = await client.put(`/auth/users/${id}`, data)
      get().setNotification('User updated', 'success')
      return { success: true, user: res.data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  },
}))

export default useStore
