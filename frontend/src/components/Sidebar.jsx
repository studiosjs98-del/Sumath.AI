import React, { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Trash2, PanelLeftClose, ChevronDown, Search, BookOpen, X, LogOut, LogIn } from 'lucide-react'
import useStore from '../store/useStore'
import { ChatContext } from '../App'
import api from '../utils/api'
import { deleteChat as deleteLocalChat, clearChats } from '../utils/localChats'

function SigmaIcon() {
  return (
    <span style={{ fontSize: 22, fontWeight: 700, color: '#4F7EFF', lineHeight: 1 }}>Σ</span>
  )
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }) {
  const navigate = useNavigate()
  const { student, isAuthenticated, logout } = useStore()
  const { activeChatId, setActiveChatId, chats, setChats } = useContext(ChatContext)

  const [historyOpen, setHistoryOpen] = useState(
    () => localStorage.getItem('sidebarHistoryOpen') !== 'false'
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    localStorage.setItem('sidebarHistoryOpen', String(next))
  }

  const handleNewChat = () => { setActiveChatId(null); navigate('/'); onMobileClose?.() }
  const handleSelectChat = (id) => { setActiveChatId(id); navigate('/'); onMobileClose?.() }
  const handleSearchSelect = (id) => { setActiveChatId(id); setSearchOpen(false); setSearchQuery(''); navigate('/'); onMobileClose?.() }

  const handleDeleteChat = (e, id) => {
    e.stopPropagation()
    deleteLocalChat(id)
    if (isAuthenticated && !String(id).startsWith('local_')) {
      api.delete(`/chat-histories/${id}`).catch(() => {})
    }
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChatId === id) setActiveChatId(null)
  }

  const handleClearHistory = () => {
    clearChats()
    setChats([])
    setActiveChatId(null)
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const gradeDisplay = student?.grade_level && student.grade_level !== 'unknown'
    ? student.grade_level
    : '학년 미설정'

  return (
    <>
      {/* Mobile backdrop */}
      <div className={`sidebar-backdrop${mobileOpen ? ' visible' : ''}`} onClick={onMobileClose} />

      <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-mobile-open' : ''}`}>

        {/* ── Header: logo + toggle ── */}
        <div className="sb-header">
          <div className="sb-logo-btn" onClick={handleNewChat} title="새 대화">
            <SigmaIcon />
          </div>
          <button onClick={onToggleCollapse} title="사이드바 닫기" className="sb-sidebar-toggle">
            <PanelLeftClose size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="sb-divider" />

        {/* ── Nav buttons ── */}
        <div className="sb-section">
          <button onClick={handleNewChat} className="sb-new-chat">
            <BookOpen size={15} strokeWidth={1.75} />
            <span>새 대화</span>
          </button>
          <button onClick={() => setSearchOpen(true)} className="sb-search-chat">
            <Search size={15} strokeWidth={1.75} />
            <span>대화 검색</span>
          </button>
        </div>

        <div className="sb-divider" />

        {/* ── Chat history ── */}
        <div className="sb-section sb-history">
          <div className="sb-section-label sb-history-toggle" onClick={toggleHistory}>
            <span>최근 대화</span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              style={{ transform: historyOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s ease', flexShrink: 0 }}
            />
          </div>
          <div className="sb-chat-list" style={{ maxHeight: historyOpen ? 500 : 0, overflow: 'hidden', transition: 'max-height 0.18s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            {chats.length === 0 ? (
              <div className="sb-empty">아직 대화가 없어요</div>
            ) : (
              <>
                {chats.map(chat => (
                  <div
                    key={chat.id}
                    className={`sb-chat-item${activeChatId === chat.id ? ' sb-chat-item-active' : ''}`}
                    onClick={() => handleSelectChat(chat.id)}
                    title={chat.title}
                  >
                    <MessageSquare size={13} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.5 }} />
                    <span className="sb-chat-title">{chat.title}</span>
                    <button className="sb-chat-delete" onClick={e => handleDeleteChat(e, chat.id)} title="삭제">
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleClearHistory}
                  style={{
                    width: '100%', marginTop: 6, padding: '6px 12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: 'var(--text-muted)', textAlign: 'left',
                    borderRadius: 6, transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  전체 삭제
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Bottom: auth ── */}
        <div className="sb-bottom">
          <div className="sb-divider" style={{ margin: '0 0 8px' }} />

          {isAuthenticated && student ? (
            <div style={{ padding: '4px 12px 8px' }}>
              {/* Profile row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                  userSelect: 'none',
                }}>
                  {student.display_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {student.display_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{gradeDisplay}</div>
                </div>
              </div>
              {/* Logout button */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 8, border: 'none',
                  background: 'none', cursor: 'pointer', fontSize: 13,
                  color: 'var(--text-muted)', transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <LogOut size={14} strokeWidth={1.75} />
                로그아웃
              </button>
            </div>
          ) : (
            <div style={{ padding: '4px 12px 8px' }}>
              <button
                onClick={() => navigate('/login')}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '9px 10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: 'var(--primary)', transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <LogIn size={14} strokeWidth={1.75} />
                로그인
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* ── Chat search overlay ── */}
      {searchOpen && (
        <div className="sidebar-search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="sidebar-search-box" onClick={e => e.stopPropagation()}>
            <div className="sidebar-search-header">
              <div>
                <div className="sidebar-search-title">대화 검색</div>
                <div className="sidebar-search-subtitle">검색어를 입력하면 결과가 나타납니다.</div>
              </div>
              <button className="sidebar-search-close" onClick={() => setSearchOpen(false)}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <input
              className="sidebar-search-input"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색할 단어를 입력하세요"
            />
            <div className="sidebar-search-results">
              {searchQuery.trim().length === 0 ? (
                <div className="sidebar-search-empty">검색어를 입력하면 결과가 나타납니다.</div>
              ) : (
                (() => {
                  const query = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
                  const results = chats.filter(chat =>
                    query.every(word => (chat.title || '').toLowerCase().includes(word))
                  )
                  return results.length === 0 ? (
                    <div className="sidebar-search-empty">검색 결과가 없습니다.</div>
                  ) : results.map(chat => (
                    <button
                      key={chat.id}
                      className="sidebar-search-result"
                      onClick={() => handleSearchSelect(chat.id)}
                    >
                      <MessageSquare size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginRight: 10 }} />
                      <span>{chat.title || '제목 없음 대화'}</span>
                    </button>
                  ))
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
