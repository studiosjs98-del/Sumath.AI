import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send } from 'lucide-react'
import useStore from '../store/useStore'

const SUGGESTIONS = [
  '이차방정식 풀이법이 뭐야?',
  '√16 + √25는?',
  '삼각함수 sin cos 차이',
]

const INITIAL_MSGS = [
  {
    role: 'assistant',
    content: '안녕하세요! 저는 AI 수학 튜터 수학이예요 👋\n어떤 수학 문제든 함께 풀어봐요!',
  },
]

export default function HeroChatCard() {
  const navigate = useNavigate()
  const { isAuthenticated } = useStore()

  const [messages, setMessages] = useState(INITIAL_MSGS)
  const [input, setInput] = useState('')
  const [sent, setSent] = useState(false)
  const [tilt, setTilt] = useState({ x: -6, y: 3 })

  const targetRef = useRef({ x: -6, y: 3 })
  const rafRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  /* ── Smooth 3D tilt tracking mouse over the viewport ── */
  useEffect(() => {
    const onMove = (e) => {
      const dx = (e.clientX / window.innerWidth - 0.5) * 2   // -1 to 1
      const dy = (e.clientY / window.innerHeight - 0.45) * 2
      targetRef.current = { x: dx * 14, y: -dy * 9 }
    }

    const lerp = (a, b, t) => a + (b - a) * t
    const tick = () => {
      setTilt(prev => {
        const nx = lerp(prev.x, targetRef.current.x, 0.05)
        const ny = lerp(prev.y, targetRef.current.y, 0.05)
        if (Math.abs(nx - prev.x) < 0.004 && Math.abs(ny - prev.y) < 0.004) return prev
        return { x: nx, y: ny }
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || sent) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    setSent(true)

    sessionStorage.setItem('pendingChatMessage', text)
    setTimeout(() => navigate(isAuthenticated ? '/ai-chat' : '/login'), 700)
  }

  const chipClick = (text) => {
    setInput(text)
    inputRef.current?.focus()
  }

  const showChips = messages.length === 1 && !sent

  return (
    <>
      <style>{`
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes heroMsgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          60%       { box-shadow: 0 0 0 5px rgba(74,222,128,0); }
        }
        .hero-chat-float { animation: heroFloat 5.5s ease-in-out infinite; }
        .hero-msg-in { animation: heroMsgIn 0.28s ease forwards; }
      `}</style>

      {/* Float wrapper */}
      <div className="hero-chat-float" style={{
        filter: 'drop-shadow(0 48px 72px rgba(10,18,60,0.55)) drop-shadow(0 16px 32px rgba(0,0,0,0.2))',
        willChange: 'transform',
      }}>
        {/* 3D tilt wrapper */}
        <div style={{
          transform: `perspective(1100px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
          transition: 'transform 0.06s linear',
          transformStyle: 'preserve-3d',
          width: 340,
        }}>

          {/* ── Ambient glow behind card ── */}
          <div style={{
            position: 'absolute', inset: -20, borderRadius: 48,
            background: 'radial-gradient(ellipse at 50% 60%, rgba(99,130,255,0.28) 0%, transparent 70%)',
            filter: 'blur(16px)',
            pointerEvents: 'none', zIndex: -1,
          }} />

          {/* ── Card ── */}
          <div style={{
            borderRadius: 28,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 0 0 1px rgba(99,130,255,0.12) inset',
          }}>

            {/* Header */}
            <div style={{
              background: 'linear-gradient(130deg, #1A3279 0%, #2563EB 100%)',
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                border: '2px solid rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, color: '#fff', fontWeight: 800, flexShrink: 0,
              }}>Σ</div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>수학이 AI</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#4ADE80',
                    display: 'inline-block', animation: 'heroPulse 2s ease-in-out infinite',
                  }} />
                  지금 온라인
                </div>
              </div>

              {/* Decorative dots (like browser chrome) */}
              <div style={{ display: 'flex', gap: 5, opacity: 0.5 }}>
                {['#FF5F57', '#FFBD2E', '#28C840'].map((c, i) => (
                  <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
                ))}
              </div>
            </div>

            {/* Messages area */}
            <div style={{
              height: 252,
              overflowY: 'auto',
              padding: '14px 14px 8px',
              display: 'flex', flexDirection: 'column', gap: 10,
              background: '#F8FAFF',
            }}>
              {messages.map((msg, i) => (
                <div key={i} className="hero-msg-in" style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end', gap: 7,
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #1A3279, #2563EB)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#fff', fontWeight: 800,
                    }}>Σ</div>
                  )}
                  <div style={{
                    maxWidth: '76%',
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #2563EB, #1D4ED8)'
                      : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#0F172A',
                    fontSize: 12.5, lineHeight: 1.65,
                    boxShadow: msg.role === 'user'
                      ? '0 3px 14px rgba(37,99,235,0.38)'
                      : '0 1px 6px rgba(0,0,0,0.07)',
                    border: msg.role === 'assistant' ? '1px solid #E4EAF5' : 'none',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Redirect indicator */}
              {sent && (
                <div className="hero-msg-in" style={{ textAlign: 'center', padding: '6px 0' }}>
                  <span style={{
                    fontSize: 11, color: '#2563EB', fontWeight: 600,
                    background: '#DBEAFE', padding: '4px 12px', borderRadius: 100,
                  }}>
                    채팅으로 이동 중...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion chips */}
            {showChips && (
              <div style={{
                padding: '0 12px 10px',
                display: 'flex', flexWrap: 'wrap', gap: 6,
                background: '#F8FAFF',
              }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => chipClick(s)} style={{
                    padding: '5px 11px',
                    background: '#EFF6FF', color: '#1D4ED8',
                    border: '1px solid #BFDBFE',
                    borderRadius: 100, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF' }}
                  >{s}</button>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid #E4EAF5',
              background: '#fff',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                placeholder="수학 질문을 입력하세요..."
                disabled={sent}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: 13, color: '#0F172A',
                  background: 'transparent', fontFamily: 'inherit',
                  opacity: sent ? 0.4 : 1,
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sent}
                style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: input.trim() && !sent ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : '#EEF1F8',
                  border: 'none',
                  cursor: input.trim() && !sent ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.18s',
                  boxShadow: input.trim() && !sent ? '0 3px 12px rgba(37,99,235,0.35)' : 'none',
                }}
                onMouseEnter={e => { if (input.trim() && !sent) e.currentTarget.style.transform = 'scale(1.08)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = '' }}
              >
                <Send size={14} color={input.trim() && !sent ? '#fff' : '#94A3B8'} strokeWidth={2.5} />
              </button>
            </div>

          </div>{/* /card */}
        </div>{/* /tilt */}
      </div>{/* /float */}
    </>
  )
}
