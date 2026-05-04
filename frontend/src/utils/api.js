import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Restore token from localStorage on load
const stored = localStorage.getItem('sumath-store')
if (stored) {
  try {
    const { state } = JSON.parse(stored)
    if (state?.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`
    }
  } catch {}
}

export default api
