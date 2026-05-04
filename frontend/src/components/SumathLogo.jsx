import React from 'react'

export default function SumathLogo({ variant = 'dark', size = 'md', iconOnly = false }) {
  const sizes = {
    sm: { icon: 28, f1: 14, f2: 9, gap: 8 },
    md: { icon: 36, f1: 17, f2: 10, gap: 11 },
    lg: { icon: 46, f1: 22, f2: 13, gap: 13 },
    xl: { icon: 60, f1: 28, f2: 16, gap: 16 },
  }
  const s = sizes[size] || sizes.md
  const dark = variant === 'dark'
  const mainColor = dark ? '#ffffff' : '#0f172a'
  const bgColor = dark ? 'rgba(74,127,255,0.12)' : 'rgba(74,127,255,0.08)'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, userSelect: 'none' }}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="36" height="36" rx="4" fill={bgColor}/>
        <rect width="36" height="36" rx="4" fill="none" stroke="#4a7fff" strokeWidth="1"/>
        <rect x="10" y="9" width="16" height="2.5" fill="#4a7fff"/>
        <rect x="10" y="24.5" width="16" height="2.5" fill="#4a7fff"/>
        <polygon points="10,11.5 18,18 10,24.5" fill="#4a7fff"/>
      </svg>

      {!iconOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, gap: 3 }}>
          <span style={{
            fontSize: s.f1,
            fontWeight: 700,
            color: mainColor,
            letterSpacing: '0.08em',
          }}>
            SUMATH
          </span>
          <span style={{
            fontSize: s.f2,
            fontWeight: 500,
            color: '#4a7fff',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>
            AI Math Tutor
          </span>
        </div>
      )}
    </div>
  )
}