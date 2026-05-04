import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import SumathLogo from '../components/SumathLogo'

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3']

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, register, loading, error } = useStore()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '', gradeLevel: '중1' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = mode === 'login'
      ? await login(form.username, form.password)
      : await register(form)
    if (ok) navigate('/ai-chat')
  }

  const inp = {
    width: '100%', padding: '11px 14px', fontSize: 14, borderRadius: 8,
    border: '1.5px solid var(--border)', outline: 'none',
    background: '#fff', color: 'var(--text)', transition: 'border-color 0.2s'
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      background: 'linear-gradient(135deg, #EFF6FF 0%, #fff 60%)'
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)', padding: '40px 36px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <SumathLogo size="lg" variant="light" showTagline />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: 'var(--bg-gray)',
          borderRadius: 8, padding: 4, marginBottom: 24
        }}>
          {[['login', '로그인'], ['register', '회원가입']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '10px', borderRadius: 6, fontSize: 14, fontWeight: 600,
                background: mode === m ? 'var(--primary)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >{label}</button>
          ))}
        </div>

        {/* Google Login */}
        <a
          href="http://localhost:3001/auth/google"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '11px 14px', marginBottom: 16,
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
            fontSize: 14, fontWeight: 600, color: '#374151',
            textDecoration: 'none', cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            transition: 'box-shadow 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google로 로그인
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'var(--error-light)', color: 'var(--error)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>아이디</label>
            <input
              type="text" value={form.username} required placeholder="아이디 입력"
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
              style={inp}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>비밀번호</label>
            <input
              type="password" value={form.password} required placeholder="비밀번호 입력"
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
              style={inp}
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>닉네임</label>
                <input
                  type="text" value={form.displayName} required placeholder="표시할 이름"
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  style={inp}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>학년</label>
                <select
                  value={form.gradeLevel}
                  onChange={e => setForm(f => ({ ...f, gradeLevel: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              height: 'var(--btn-h)', marginTop: 4,
              background: loading ? 'var(--border)' : 'var(--primary)',
              color: loading ? 'var(--text-muted)' : '#fff',
              borderRadius: 8, fontWeight: 700, fontSize: 15,
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div style={{
          marginTop: 20, padding: '10px 14px',
          background: 'var(--primary-light)', borderRadius: 8,
          fontSize: 12, color: 'var(--primary)', textAlign: 'center'
        }}>
          💡 데모 계정: <strong>demo</strong> / <strong>demo123</strong>
        </div>
      </div>
    </div>
  )
}
