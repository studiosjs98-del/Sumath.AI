import React, { useState, useEffect, createContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import useStore from './store/useStore'
import api from './utils/api'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import Toast from './components/Toast'
import SumathLogo from './components/SumathLogo'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import AiChatPage from './pages/AiChatPage'
import { useHintMode } from './hooks/useHintMode'
import HintModePopup from './components/HintModePopup'
import HintModeToggle from './components/HintModeToggle'
import OnboardingFlow from './components/OnboardingFlow'

export const ChatContext = createContext(null)

function PrivateRoute({ children }) {
  const { isAuthenticated } = useStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

// Layout with sidebar for authenticated pages
function AuthLayout({ children, showFooter = true, fullHeight = false }) {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  )
  const { hintMode, hasChosen, setHintMode } = useHintMode()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [chats, setChats] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)

  const { isAuthenticated } = useStore()

  // Load chat list whenever user is authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    api.get('/chat-histories')
      .then(r => setChats(Array.isArray(r.data) ? r.data : []))
      .catch(err => console.error('[chats] load failed:', err?.response?.status, err?.message))
  }, [isAuthenticated])

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

// Minimal layout for public pages (no sidebar)
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
    // Handle OAuth token from URL query param
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      // Fetch student info then log in
      api.defaults.headers.common['Authorization'] = `Bearer ${urlToken}`
      api.get('/auth/me').then(res => {
        loginWithToken(urlToken, res.data.student)
        window.history.replaceState({}, '', window.location.pathname)
      }).catch(() => {
        delete api.defaults.headers.common['Authorization']
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
            {/* Public — no sidebar */}
            <Route path="/" element={<PublicLayout><LandingPage /></PublicLayout>} />
            <Route path="/login" element={<PublicLayout><LoginPage /></PublicLayout>} />

            {/* Private — sidebar layout */}
            <Route path="/ai-chat" element={
              <PrivateRoute>
                <AuthLayout showFooter={false} fullHeight><AiChatPage /></AuthLayout>
              </PrivateRoute>
            } />

            {/* Catch-all: authenticated users go to chat, others to landing */}
            <Route path="*" element={<Navigate to="/ai-chat" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
