import React from 'react'
import { motion } from 'framer-motion'
import { XCircle, HelpCircle, CheckCircle } from 'lucide-react'

const GREY = '#6B7280'

const buttons = [
  { label: '틀림',  Icon: XCircle,     desc: '이해 못함',      bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.25)',  color: '#ef4444' },
  { label: '헷갈림', Icon: HelpCircle,  desc: '조금 불확실',    bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b' },
  { label: '맞음',  Icon: CheckCircle, desc: '확실히 알았어요', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', color: '#10b981' }
]

export default function ConfidenceButtons({ onSelect, disabled = false }) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '500' }}>
        이 문제를 얼마나 이해했나요?
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {buttons.map(btn => (
          <motion.button
            key={btn.label}
            whileHover={!disabled ? { scale: 1.03, y: -2 } : {}}
            whileTap={!disabled ? { scale: 0.97 } : {}}
            onClick={() => !disabled && onSelect(btn.label)}
            disabled={disabled}
            style={{
              padding: '14px 8px',
              background: btn.bg, border: `2px solid ${btn.border}`,
              borderRadius: '12px', color: btn.color,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <btn.Icon size={22} color={GREY} strokeWidth={1.75} />
            <span style={{ fontSize: '15px', fontWeight: '700' }}>{btn.label}</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>{btn.desc}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
