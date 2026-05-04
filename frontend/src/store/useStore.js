import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../utils/api'

let toastId = 0

const useStore = create(
  persist(
    (set, get) => ({
      token: null, student: null, isAuthenticated: false,
      toasts: [],
      loading: false, error: null,

      // Toast
      addToast: (message, type = 'info', title = '', duration = 3500) => {
        const id = ++toastId
        set(s => ({ toasts: [...s.toasts, { id, message, type, title }] }))
        setTimeout(() => get().removeToast(id), duration)
        return id
      },
      removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      // Auth
      login: async (username, password) => {
        set({ loading: true, error: null })
        try {
          const res = await api.post('/auth/login', { username, password })
          api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`
          set({ token: res.data.token, student: res.data.student, isAuthenticated: true, loading: false })
          return true
        } catch (err) {
          set({ error: err.response?.data?.error || '로그인 실패', loading: false })
          return false
        }
      },
      register: async (data) => {
        set({ loading: true, error: null })
        try {
          const res = await api.post('/auth/register', data)
          api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`
          set({ token: res.data.token, student: res.data.student, isAuthenticated: true, loading: false })
          return true
        } catch (err) {
          set({ error: err.response?.data?.error || '회원가입 실패', loading: false })
          return false
        }
      },
      logout: () => {
        delete api.defaults.headers.common['Authorization']
        set({ token: null, student: null, isAuthenticated: false })
      },
      loginWithToken: (token, student) => {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        set({ token, student, isAuthenticated: true })
      },
      updateStudent: (updates) => set(s => ({ student: { ...s.student, ...updates } })),
    }),
    {
      name: 'sumath-store',
      partialize: s => ({ token: s.token, student: s.student, isAuthenticated: s.isAuthenticated })
    }
  )
)

export default useStore
