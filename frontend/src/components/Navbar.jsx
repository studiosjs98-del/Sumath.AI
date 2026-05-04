import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import useStore from '../store/useStore'
import SumathLogo from './SumathLogo'

const GREY = '#64748B'

const NAV_LINKS = [
  { path: '/dashboard', label: '홈' },
  { path: '/study', label: '문제풀기' },
  { path: '/bookmarks', label: '복습목록' },
  { path: '/ranking', label: '전국랭킹' },
  { path: '/wrong-answers', label: '오답노트' },
  { path: '/progress', label: '진도현황' },
  { path: '/ai-chat', label: 'AI 채팅' },
]
const SUNEUNG_PATH = '/suneung'

const RANK_COLORS = {
  '9급': '#94a3b8', '8급': '#94a3b8', '7급': '#94a3b8',
  '6급': '#0891b2', '5급': '#0891b2', '4급': '#0891b2',
  '3급': '#7c3aed', '2급': '#7c3aed', '1급': '#7c3aed',
  '초단': '#d97706', '1단': '#d97706', '2단': '#ea580c',
  '3단': '#dc2626', '사범': '#be185d'
}

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { student, isAuthenticated, logout } = useStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <>
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        height: 'var(--nav-height)',
        background: scrolled ? 'rgba(250,251,255,0.92)' : 'var(--bg)',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
        boxShadow: scrolled ? 'var(--shadow-sm)' : 'none',
        transition: 'background 0.25s, box-shadow 0.25s, border-color 0.25s',
      }}>
        <div className="container" style={{
          height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '24px',
        }}>
          {/* Logo */}
          <Link to={isAuthenticated ? '/dashboard' : '/'} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <SumathLogo size="md" variant="light" />
          </Link>

          {/* Desktop nav links */}
          {isAuthenticated && (
            <nav style={{ display: 'flex', gap: '2px', flex: 1, justifyContent: 'center', alignItems: 'center' }} className="desktop-nav">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 100,
                    fontSize: '14px',
                    fontWeight: isActive(link.path) ? '700' : '500',
                    color: isActive(link.path) ? 'var(--primary-dark)' : 'var(--text-muted)',
                    background: isActive(link.path) ? 'var(--primary-light)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    if (!isActive(link.path)) {
                      e.currentTarget.style.background = 'var(--bg-gray)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive(link.path)) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }
                  }}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to={SUNEUNG_PATH}
                style={{
                  padding: '7px 14px', borderRadius: 100,
                  fontSize: '14px', fontWeight: 800,
                  color: isActive(SUNEUNG_PATH) ? '#fff' : '#1e293b',
                  background: isActive(SUNEUNG_PATH)
                    ? 'linear-gradient(135deg, #1e3a8a, #1a56db)'
                    : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  textDecoration: 'none',
                  transition: 'all 0.18s',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.2px',
                  boxShadow: '0 2px 10px rgba(251,191,36,0.3)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(251,191,36,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 10px rgba(251,191,36,0.3)' }}
              >
                수능 대비
              </Link>
            </nav>
          )}

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {isAuthenticated ? (
              <div
                onClick={handleLogout}
                title="로그아웃 (클릭)"
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '5px 14px 5px 6px',
                  background: 'var(--bg-gray)',
                  borderRadius: 100,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.borderColor = '#BFDBFE' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-gray)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: `linear-gradient(135deg, var(--primary), #7C3AED)`,
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '800', fontSize: '13px', flexShrink: 0,
                }}>{student?.display_name?.[0] || '?'}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: RANK_COLORS[student?.rank] || GREY, lineHeight: 1 }}>
                    {student?.rank}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1, marginTop: '2px' }}>
                    {(student?.xp || 0).toLocaleString()} XP
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-md" style={{ textDecoration: 'none' }}>로그인</Link>
                <Link to="/login?register=1" className="btn btn-primary btn-md" style={{ textDecoration: 'none' }}>회원가입</Link>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="mobile-only"
              style={{
                width: '40px', height: '40px', borderRadius: 100,
                background: 'var(--bg-gray)', color: GREY, border: 'none',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {mobileOpen
                ? <X size={20} color={GREY} strokeWidth={1.75} />
                : <Menu size={20} color={GREY} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'fixed', top: 'var(--nav-height)', left: 0, right: 0, zIndex: 999,
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              padding: '12px 16px 20px',
              boxShadow: 'var(--shadow-lg)',
              borderRadius: '0 0 28px 28px',
            }}
          >
            {isAuthenticated ? (
              <>
                {NAV_LINKS.map(link => (
                  <Link key={link.path} to={link.path} style={{
                    display: 'block', padding: '13px 18px', borderRadius: 16,
                    fontSize: '15px', fontWeight: isActive(link.path) ? '700' : '500',
                    color: isActive(link.path) ? 'var(--primary-dark)' : 'var(--text)',
                    background: isActive(link.path) ? 'var(--primary-light)' : 'transparent',
                    textDecoration: 'none', marginBottom: '3px',
                  }}>{link.label}</Link>
                ))}
                <Link to={SUNEUNG_PATH} style={{
                  display: 'block', padding: '13px 18px', borderRadius: 16,
                  fontSize: '15px', fontWeight: 800,
                  color: '#1e293b',
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  textDecoration: 'none', marginBottom: '3px',
                }}>수능 대비</Link>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link to="/login" className="btn btn-outline" style={{ textDecoration: 'none', justifyContent: 'center' }}>로그인</Link>
                <Link to="/login?register=1" className="btn btn-primary" style={{ textDecoration: 'none', justifyContent: 'center' }}>회원가입</Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-only { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-only { display: none !important; }
        }
      `}</style>
    </>
  )
}
