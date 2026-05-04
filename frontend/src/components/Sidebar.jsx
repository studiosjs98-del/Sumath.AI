import React, { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Trash2, PanelLeftClose, ChevronDown, Search, BookOpen, X } from 'lucide-react'
import useStore from '../store/useStore'
import { ChatContext } from '../App'
import api from '../utils/api'

function SigmaIcon() {
  return (
    <span style={{ fontSize: 22, fontWeight: 700, color: '#4F7EFF', lineHeight: 1 }}>Σ</span>
  )
}



export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }) {
  const navigate = useNavigate()
  const { student, isAuthenticated } = useStore()
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

  const handleNewChat = () => { setActiveChatId(null); navigate('/ai-chat'); onMobileClose?.() }
  const handleSelectChat = (id) => { setActiveChatId(id); navigate('/ai-chat'); onMobileClose?.() }
  const handleSearchSelect = (id) => { setActiveChatId(id); setSearchOpen(false); setSearchQuery(''); navigate('/ai-chat'); onMobileClose?.() }
  const handleDeleteChat = (e, id) => {
    e.stopPropagation()
    api.delete(`/chat-histories/${id}`).catch(() => {})
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChatId === id) setActiveChatId(null)
  }

  const gradeDisplay = student?.grade_level && student.grade_level !== 'unknown'
    ? student.grade_level
    : '학년 미설정'

  return (
    <>
      {/* Mobile backdrop */}
      <div className={`sidebar-backdrop${mobileOpen ? ' visible' : ''}`} onClick={onMobileClose} />

      <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-mobile-open' : ''}`}>

        {/* ── 1. Header: logo + toggle ── */}
        <div className="sb-header">
          <div className="sb-logo-btn" onClick={handleNewChat} title="새 대화">
            <SigmaIcon />
          </div>
          <button onClick={onToggleCollapse} title="사이드바 닫기" className="sb-sidebar-toggle">
            <PanelLeftClose size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="sb-divider" />

        {/* ── 3. Nav buttons ── */}
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

        {/* ── 4. Chat history ── */}
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
              chats.map(chat => (
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
              ))
            )}
          </div>
        </div>

        {/* ── 5. Bottom: profile (settings trigger) ── */}
        <div className="sb-bottom">
          <div className="sb-divider" style={{ margin: '0 0 8px' }} />

          {isAuthenticated && student && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                transition: 'background 0.18s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Gradient avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 15,
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                userSelect: 'none',
              }}>
                {student.display_name?.[0]?.toUpperCase() || '?'}
              </div>

              {/* Name + grade */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {student.display_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {gradeDisplay}
                </div>
              </div>

              {/* Settings cog hint */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, opacity: 0.6 }}
              >
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
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
