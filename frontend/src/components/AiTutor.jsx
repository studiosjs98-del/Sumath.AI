import React, { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Minus, Sparkles } from 'lucide-react'
import { MathText } from './MathRenderer'
import api from '../utils/api'
import useStore from '../store/useStore'

const WELCOME = '안녕하세요! 저는 AI 수학 튜터 "수학이"예요 👋\n수학 문제가 있으면 무엇이든 물어보세요!'

export default function AiTutor() {
  const { isAuthenticated } = useStore()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasNew, setHasNew] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 120)
      setHasNew(false)
    }
  }, [messages, open, minimized])

  if (!isAuthenticated) return null

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = [...messages, userMsg]
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }))
      const res = await api.post('/chat/message', { messages: history })
      const reply = { role: 'assistant', content: res.data.reply }
      setMessages(m => [...m, reply])
      if (!open || minimized) setHasNew(true)
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '죄송해요, 잠시 문제가 생겼어요. 다시 시도해주세요.' }])
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    setOpen(o => !o)
    setMinimized(false)
    setHasNew(false)
  }

  return (
    <>
      {/* Floating button */}
      <div style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
      }}>
        {!open && (
          <div style={{
            background: 'var(--primary)',
            color: '#fff', padding: '5px 12px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(26,86,219,0.4)',
            animation: 'tutorLabel 3s ease-in-out infinite'
          }}>
            AI 튜터 수학이
          </div>
        )}
        <button
          onClick={toggle}
          title={open ? '닫기' : 'AI 수학 튜터 열기'}
          style={{
            width: 58, height: 58, borderRadius: '50%',
            background: 'var(--primary)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: open ? '0 4px 20px rgba(26,86,219,0.4)' : '0 4px 24px rgba(26,86,219,0.5)',
            animation: open ? 'none' : 'tutorPulse 2.8s ease infinite',
            transition: 'transform 0.2s, box-shadow 0.2s',
            position: 'relative'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {open ? <X size={22} color="#fff" strokeWidth={2.5} /> : <Bot size={24} color="#fff" strokeWidth={1.75} />}
          {/* New message dot */}
          {hasNew && !open && (
            <div style={{
              position: 'absolute', top: 2, right: 2, width: 12, height: 12,
              background: '#ef4444', borderRadius: '50%', border: '2px solid #fff'
            }} />
          )}
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 104, right: 28, zIndex: 999,
          width: 360, maxWidth: 'calc(100vw - 56px)',
          height: minimized ? 58 : 480,
          background: '#fff', borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          border: '1px solid #e0e7ff',
          overflow: 'hidden',
          animation: 'tutorSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          transition: 'height 0.3s cubic-bezier(0.34,1.56,0.64,1)'
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px',
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            cursor: 'pointer'
          }} onClick={() => setMinimized(m => !m)}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Bot size={17} color="#fff" strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>수학이 AI 튜터</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                {loading ? '생각 중...' : '언제든지 물어보세요'}
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setMinimized(m => !m) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4, lineHeight: 1 }}
            >
              <Minus size={15} strokeWidth={2.5} color="rgba(255,255,255,0.8)" />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end', gap: 7
                  }}>
                    {m.role === 'assistant' && (
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 }}>
                        <Sparkles size={12} color="#fff" strokeWidth={1.75} />
                      </div>
                    )}
                    <div style={{
                      maxWidth: '82%', padding: '9px 13px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user' ? 'var(--primary)' : '#f3f4f6',
                      color: m.role === 'user' ? '#fff' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.75,
                      boxShadow: m.role === 'user' ? '0 2px 8px rgba(26,86,219,0.3)' : 'none'
                    }}>
                      <MathText text={m.content} />
                    </div>
                  </div>
                ))}

                {loading && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Sparkles size={12} color="#fff" strokeWidth={1.75} />
                    </div>
                    <div style={{ background: '#f3f4f6', padding: '10px 14px', borderRadius: '16px 16px 16px 4px' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[0, 1, 2].map(j => (
                          <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: '#a5b4fc', animation: `tutorDot 1s ease infinite ${j * 0.2}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick prompts */}
              {messages.length === 1 && (
                <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['이차방정식 풀이법', '삼각함수 기초', '미분 개념 설명'].map(q => (
                    <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }} style={{
                      padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: 'var(--primary-light)', color: 'var(--primary)',
                      border: '1px solid #bfdbfe', cursor: 'pointer', transition: 'all 0.15s'
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                    >{q}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="수학 질문을 입력하세요..."
                  disabled={loading}
                  style={{
                    flex: 1, height: 40, padding: '0 12px',
                    border: '1.5px solid var(--border)', borderRadius: 10,
                    fontSize: 13, outline: 'none',
                    background: loading ? 'var(--bg-gray)' : '#fff',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: input.trim() && !loading ? 'var(--primary)' : '#f3f4f6',
                    border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, transform 0.1s'
                  }}
                  onMouseEnter={e => { if (input.trim() && !loading) e.currentTarget.style.transform = 'scale(1.05)' }}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Send size={15} color={input.trim() && !loading ? '#fff' : '#9ca3af'} strokeWidth={2} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes tutorPulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(26,86,219,0.5); }
          50% { box-shadow: 0 4px 32px rgba(26,86,219,0.9), 0 0 0 10px rgba(26,86,219,0.08); }
        }
        @keyframes tutorLabel {
          0%, 100% { opacity: 0.85; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes tutorSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tutorDot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
