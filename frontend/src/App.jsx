import React, { useState, useEffect, createContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import useStore from './store/useStore'
import api from './utils/api'
import { getChats } from './utils/localChats'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import Toast from './components/Toast'
import SumathLogo from './components/SumathLogo'
import LoginPage from './pages/LoginPage'
import AiChatPage from './pages/AiChatPage'
import { useHintMode } from './hooks/useHintMode'
import OnboardingFlow from './components/OnboardingFlow'

export const ChatContext = createContext(null)

function AuthLayout({ children, showFooter = true, fullHeight = false }) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  )
  const { hintMode, hasChosen, setHintMode } = useHintMode()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)

  // Load chat history from localStorage on mount — works for all users
  useEffect(() => {
    setChats(getChats())
  }, [])

  const sidebarW = collapsed ? 0 : 240

  return (
    <ChatContext.Provider value={{
      activeChatId, setActiveChatId, chats, setChats,
      sidebarCollapsed: collapsed,
      toggleSidebar: () => { const next = !collapsed; setCollapsed(next); localStorage.setItem('sidebarCollapsed', String(next)) }
    }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-gray)' }}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => { const next = !collapsed; setCollapsed(next); localStorage.setItem('sidebarCollapsed', String(next)) }}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div
          className="main-layout"
          style={{
            marginLeft: sidebarW,
            flex: 1,
            minWidth: 0,
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            ...(fullHeight ? { height: '100%', overflow: 'hidden' } : {})
          }}
        >
          {/* Mobile top bar */}
          <div className="mobile-header">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
            <SumathLogo size="sm" variant="light" />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }} className="page-content">
            {children}
          </div>
          {showFooter && <Footer />}
        </div>

        <Toast />
      </div>
    </ChatContext.Provider>
  )
}

function PublicLayout({ children }) {
  return (
    <>
      {children}
      <Toast />
    </>
  )
}

export default function App() {
  const { token, logout, loginWithToken, isAuthenticated } = useStore()
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('onboarding_complete')
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      // Strip token from URL immediately — before any async work
      window.history.replaceState({}, '', window.location.pathname)
      api.defaults.headers.common['Authorization'] = `Bearer ${urlToken}`

      api.get('/auth/me')
        .then(res => {
          loginWithToken(urlToken, res.data.student)
          // Persist is synchronous — reload to render fully authenticated state
          window.location.replace('/')
        })
        .catch(() => {
          // /auth/me failed (CORS, cold start, network) — decode JWT locally
          // and log in with minimal data so the user isn't silently dropped
          try {
            const payload = JSON.parse(atob(urlToken.split('.')[1]))
            if (payload?.studentId) {
              loginWithToken(urlToken, {
                id: payload.studentId,
                display_name: '',
                grade_level: '',
              })
              window.location.replace('/')
            } else {
              delete api.defaults.headers.common['Authorization']
            }
          } catch {
            delete api.defaults.headers.common['Authorization']
          }
        })
    } else if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    api.interceptors.response.use(
      res => res,
      err => { if (err.response?.status === 401) logout(); return Promise.reject(err) }
    )
  }, [])

  return (
    <BrowserRouter>
      {isAuthenticated && showOnboarding && (
        <OnboardingFlow onComplete={() => setShowOnboarding(false)} />
      )}
      <div className="site-shell">
        <header className="site-header">
          <div className="site-header-inner" />
        </header>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Routes>
            {/* Login page — optional, not required */}
            <Route path="/login" element={<PublicLayout><LoginPage /></PublicLayout>} />

            {/* Main chat — accessible to everyone, no auth required */}
            <Route path="/" element={
              <AuthLayout showFooter={false} fullHeight><AiChatPage /></AuthLayout>
            } />

            {/* Catch-all to chat */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
