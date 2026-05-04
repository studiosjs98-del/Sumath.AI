import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'

const navItems = [
  { path: '/dashboard', label: '홈', icon: '🏠' },
  { path: '/study', label: '학습', icon: '📚' },
  { path: '/progress', label: '분석', icon: '📊' },
]

const rankColors = {
  '9급': '#94a3b8', '8급': '#94a3b8', '7급': '#94a3b8',
  '6급': '#22d3ee', '5급': '#22d3ee', '4급': '#22d3ee',
  '3급': '#a78bfa', '2급': '#a78bfa', '1급': '#a78bfa',
  '초단': '#fbbf24', '1단': '#fbbf24', '2단': '#fb923c',
  '3단': '#f87171', '사범': '#ff6b6b'
}

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { student, logout } = useStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <Link to="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>📐</span>
          <span style={{ fontWeight: '900', fontSize: '18px', color: 'var(--accent)', letterSpacing: '-0.5px' }}>
            수학 마스터
          </span>
        </Link>

        <nav style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                color: location.pathname.startsWith(item.path) ? 'var(--accent)' : 'var(--text-secondary)',
                background: location.pathname.startsWith(item.path) ? 'rgba(108,99,255,0.12)' : 'transparent',
                fontWeight: location.pathname.startsWith(item.path) ? '600' : '500',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        {student && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: rankColors[student.rank] || '#94a3b8' }}>
                {student.rank}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {(student.xp || 0).toLocaleString()} XP
              </div>
            </div>
            <div
              onClick={handleLogout}
              title="로그아웃"
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--accent)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: '700', fontSize: '16px',
                cursor: 'pointer', color: 'white'
              }}
            >
              {student.display_name?.[0] || '?'}
            </div>
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        padding: '8px 0',
        zIndex: 100
      }} className="mobile-nav">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textDecoration: 'none', gap: '2px',
              color: location.pathname.startsWith(item.path) ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '10px', fontWeight: '500'
            }}
          >
            <span style={{ fontSize: '20px' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <style>{`
        @media (min-width: 768px) { .mobile-nav { display: none !important; } }
        @media (max-width: 767px) { main { padding-bottom: 72px; } }
      `}</style>
    </div>
  )
}
