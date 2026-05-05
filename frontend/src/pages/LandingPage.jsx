import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUp } from 'lucide-react'
import useStore from '../store/useStore'

/* ── Floating math cards shown in the 3D background ── */
const BG_CARDS = [
  {
    formula: 'x = −b ± √(b²−4ac)',
    sub:     '2a',
    label:   '근의 공식',
    color:   '#EFF6FF',
    accent:  '#2563EB',
    pos:     { top: '12%', left: '3%' },
    rot:     'perspective(700px) rotateY(18deg) rotateX(-6deg)',
    anim:    '0s',
  },
  {
    formula: 'sin²θ + cos²θ = 1',
    sub:     null,
    label:   '삼각항등식',
    color:   '#F5F3FF',
    accent:  '#7C3AED',
    pos:     { top: '10%', right: '3%' },
    rot:     'perspective(700px) rotateY(-16deg) rotateX(5deg)',
    anim:    '1.4s',
  },
  {
    formula: 'd/dx [xⁿ] = n·xⁿ⁻¹',
    sub:     null,
    label:   '미분 기본',
    color:   '#F0FDF4',
    accent:  '#16A34A',
    pos:     { top: '48%', left: '1%' },
    rot:     'perspective(700px) rotateY(20deg) rotateX(8deg)',
    anim:    '2.1s',
  },
  {
    formula: '∫ f(x) dx = F(x) + C',
    sub:     null,
    label:   '부정적분',
    color:   '#FFF7ED',
    accent:  '#EA580C',
    pos:     { top: '50%', right: '1%' },
    rot:     'perspective(700px) rotateY(-22deg) rotateX(-7deg)',
    anim:    '0.7s',
  },
  {
    formula: 'aₙ = a₁ + (n−1)d',
    sub:     null,
    label:   '등차수열',
    color:   '#FFF1F2',
    accent:  '#BE185D',
    pos:     { bottom: '18%', left: '4%' },
    rot:     'perspective(700px) rotateY(14deg) rotateX(-10deg)',
    anim:    '3s',
  },
  {
    formula: 'P(A∪B) = P(A)+P(B)−P(A∩B)',
    sub:     null,
    label:   '확률 덧셈',
    color:   '#F0F9FF',
    accent:  '#0284C7',
    pos:     { bottom: '16%', right: '3%' },
    rot:     'perspective(700px) rotateY(-18deg) rotateX(9deg)',
    anim:    '1.8s',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  useStore()
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [ready, setReady] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80)
    return () => clearTimeout(t)
  }, [])

  const doSend = (text) => {
    const msg = (text ?? input).trim()
    if (!msg) return
    sessionStorage.setItem('pendingChatMessage', msg)
    navigate('/chat')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() }
  }

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const canSend = input.trim().length > 0

  return (
    <div style={{
      minHeight: '100vh', background: '#ffffff',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        /* ── Blob drifts ── */
        @keyframes b1 {
          0%,100% { transform:translate(0,0) scale(1); }
          40%     { transform:translate(80px,-60px) scale(1.14); }
          70%     { transform:translate(-50px,40px) scale(0.9); }
        }
        @keyframes b2 {
          0%,100% { transform:translate(0,0) scale(1); }
          35%     { transform:translate(-70px,80px) scale(1.1); }
          65%     { transform:translate(55px,-50px) scale(0.93); }
        }
        @keyframes b3 {
          0%,100% { transform:translate(0,0) scale(1); }
          50%     { transform:translate(60px,70px) scale(1.08); }
        }

        /* ── Floating card hover ── */
        @keyframes cardFloat {
          0%,100% { transform: var(--rot) translateY(0px); }
          50%     { transform: var(--rot) translateY(-14px); }
        }

        /* ── Entrance ── */
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(32px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .l-up { opacity:0; }
        .l-up.go { animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }

        /* ── Top bar links ── */
        .l-nav-link {
          padding: 8px 22px; border-radius: 100px;
          font-size: 14px; font-weight: 600;
          text-decoration: none; font-family: inherit;
          transition: all 0.18s; cursor: pointer;
        }
        .l-nav-ghost {
          color: #64748B; border: 1.5px solid #E2E8F0; background: transparent;
        }
        .l-nav-ghost:hover { background: #F8FAFC; border-color: #CBD5E1; color: #0F172A; }
        .l-nav-solid {
          background: #0F172A; color: #fff; border: 1.5px solid transparent;
          box-shadow: 0 2px 12px rgba(0,0,0,0.12);
        }
        .l-nav-solid:hover { background: #1E293B; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.18); }

        /* ── Send button ── */
        .l-send-btn { transition: transform 0.18s, box-shadow 0.18s; }
        .l-send-btn:not(:disabled):hover { transform: scale(1.1); }
        .l-send-btn:not(:disabled):active { transform: scale(0.94); }

        /* ── Textarea placeholder ── */
        textarea.l-ta::placeholder { color: #94A3B8; }
        textarea.l-ta { caret-color: #2563EB; }

        /* ── 3D perspective grid ── */
        .l-grid {
          position: absolute;
          bottom: 0; left: -60%; right: -60%;
          height: 42%;
          background-image:
            linear-gradient(rgba(37,99,235,0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37,99,235,0.09) 1px, transparent 1px);
          background-size: 56px 56px;
          transform: perspective(380px) rotateX(58deg);
          transform-origin: 50% 100%;
          -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 75%);
          mask-image: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 75%);
          pointer-events: none;
        }

        /* ── Floating cards ── */
        .l-card {
          position: absolute;
          padding: 16px 20px; border-radius: 20px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow:
            0 8px 32px rgba(0,0,0,0.08),
            0 2px 8px rgba(0,0,0,0.04),
            0 0 0 1px rgba(255,255,255,0.9) inset;
          pointer-events: none;
          min-width: 180px;
          animation: cardFloat 6s ease-in-out infinite;
        }
        .l-card-formula {
          font-size: 15px; font-weight: 700;
          color: #0F172A; line-height: 1.4;
          white-space: nowrap;
        }
        .l-card-sub {
          font-size: 15px; font-weight: 700;
          color: #0F172A; text-align: center;
          border-top: 1.5px solid currentColor;
          margin-top: 2px; padding-top: 2px;
        }
        .l-card-label {
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          margin-top: 8px; opacity: 0.65;
        }

        @media (max-width: 768px) {
          .l-card { display: none; }
          .l-grid { display: none; }
        }
      `}</style>

      {/* ── Light ambient blobs ─────────────────────────────── */}
      <div aria-hidden style={{
        position:'absolute', width:900, height:900, borderRadius:'50%',
        top:'-30%', left:'10%',
        background:'radial-gradient(circle, rgba(219,234,254,0.8) 0%, transparent 60%)',
        filter:'blur(60px)',
        animation:'b1 22s ease-in-out infinite',
        pointerEvents:'none',
      }} />
      <div aria-hidden style={{
        position:'absolute', width:700, height:700, borderRadius:'50%',
        top:'10%', right:'-10%',
        background:'radial-gradient(circle, rgba(237,233,254,0.75) 0%, transparent 60%)',
        filter:'blur(70px)',
        animation:'b2 26s ease-in-out infinite',
        pointerEvents:'none',
      }} />
      <div aria-hidden style={{
        position:'absolute', width:600, height:600, borderRadius:'50%',
        bottom:'-10%', left:'35%',
        background:'radial-gradient(circle, rgba(204,251,241,0.55) 0%, transparent 60%)',
        filter:'blur(80px)',
        animation:'b3 30s ease-in-out infinite',
        pointerEvents:'none',
      }} />

      {/* ── 3D perspective grid floor ─────────────────────────── */}
      <div aria-hidden className="l-grid" />

      {/* ── Floating math cards ─────────────────────────────── */}
      {BG_CARDS.map((card, i) => (
        <div
          key={i}
          className="l-card"
          style={{
            ...card.pos,
            '--rot': card.rot,
            background: card.color,
            animationDelay: card.anim,
            animationDuration: `${5.5 + i * 0.7}s`,
            zIndex: 2,
          }}
        >
          {card.sub ? (
            <div style={{ textAlign: 'center' }}>
              <div className="l-card-formula">{card.formula}</div>
              <div className="l-card-sub" style={{ color: card.accent, borderColor: card.accent }}>
                {card.sub}
              </div>
            </div>
          ) : (
            <div className="l-card-formula">{card.formula}</div>
          )}
          <div className="l-card-label" style={{ color: card.accent }}>{card.label}</div>
        </div>
      ))}

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header style={{
        position:'relative', zIndex:20,
        display:'flex', alignItems:'center', justifyContent:'flex-end',
        padding:'22px 40px', gap: 8,
      }}>
        <Link to="/login" className="l-nav-link l-nav-ghost">로그인</Link>
        <Link to="/chat" className="l-nav-link l-nav-solid">무료 시작</Link>
      </header>

      {/* ── Main centred content ─────────────────────────────── */}
      <main style={{
        flex:1, position:'relative', zIndex:10,
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'0 24px 100px',
      }}>

        {/* Brand name — very large gradient text */}
        <div className={`l-up${ready?' go':''}`} style={{ animationDelay:'0.05s', textAlign:'center', marginBottom: 16 }}>
          <h1 style={{
            fontSize:'clamp(4rem, 10vw, 8rem)',
            fontWeight:900,
            letterSpacing:'-4px',
            lineHeight:1.0,
            margin:0,
            background:'linear-gradient(140deg, #1E3A8A 0%, #2563EB 40%, #7C3AED 75%, #DB2777 100%)',
            WebkitBackgroundClip:'text',
            WebkitTextFillColor:'transparent',
            backgroundClip:'text',
          }}>
            수학이
          </h1>
        </div>

        {/* Subtitle */}
        <div className={`l-up${ready?' go':''}`} style={{ animationDelay:'0.14s', textAlign:'center', marginBottom: 48 }}>
          <p style={{
            fontSize:'clamp(1rem, 2vw, 1.2rem)',
            color:'#64748B', margin:0,
            fontWeight:400, lineHeight:1.6,
            letterSpacing:'-0.2px',
          }}>
            AI와 함께하는 진짜 수학 이해
          </p>
        </div>

        {/* ── Chat input ─────────────────────────────────────── */}
        <div className={`l-up${ready?' go':''}`} style={{ animationDelay:'0.22s', width:'100%', maxWidth:660 }}>
          <div style={{
            background: focused ? '#fff' : '#F8FAFC',
            border: focused
              ? '1.5px solid #2563EB'
              : '1.5px solid #E2E8F0',
            borderRadius:24,
            padding:'18px 16px 16px 22px',
            display:'flex', alignItems:'flex-end', gap:12,
            transition:'border-color 0.22s, background 0.22s, box-shadow 0.22s',
            boxShadow: focused
              ? '0 0 0 4px rgba(37,99,235,0.08), 0 8px 40px rgba(37,99,235,0.1)'
              : '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <textarea
              ref={textareaRef}
              className="l-ta"
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="수학 문제나 개념을 입력하세요…"
              rows={1}
              style={{
                flex:1, background:'transparent',
                border:'none', outline:'none',
                fontSize:16, color:'#0F172A',
                fontFamily:'inherit', fontWeight:400,
                lineHeight:1.65, resize:'none', minHeight:28,
              }}
            />
            <button
              className="l-send-btn"
              onClick={() => doSend()}
              disabled={!canSend}
              style={{
                width:42, height:42, borderRadius:'50%',
                border:'none', flexShrink:0,
                background: canSend
                  ? 'linear-gradient(145deg, #3B72FF, #1D4ED8)'
                  : '#EEF2FF',
                cursor: canSend ? 'pointer' : 'default',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow: canSend ? '0 4px 18px rgba(37,99,235,0.38)' : 'none',
              }}
            >
              <ArrowUp size={18} color={canSend ? '#fff' : '#A5B4FC'} strokeWidth={2.5} />
            </button>
          </div>

          <p style={{
            textAlign:'center', margin:'10px 0 0',
            fontSize:12, color:'#CBD5E1', letterSpacing:'0.02em',
          }}>
            Enter로 전송 &nbsp;·&nbsp; Shift+Enter로 줄바꿈
          </p>
        </div>
      </main>
    </div>
  )
}
