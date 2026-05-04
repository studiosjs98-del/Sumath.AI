import React from 'react'
import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

const ICON_COLOR = '#6B7280'

export default function StreakBadge({ streak, size = 'md' }) {
  const sizes = {
    sm: { container: '60px', iconSize: 20, number: '16px', label: '9px' },
    md: { container: '80px', iconSize: 28, number: '22px', label: '11px' },
    lg: { container: '100px', iconSize: 36, number: '28px', label: '13px' }
  }
  const s = sizes[size]

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'default' }}
    >
      <div style={{
        width: s.container, height: s.container, borderRadius: '50%',
        background: 'var(--bg-gray)',
        border: `2px solid var(--border)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <Flame size={s.iconSize} color={ICON_COLOR} strokeWidth={1.75} />
        <span style={{ fontSize: s.number, fontWeight: '900', color: ICON_COLOR, lineHeight: 1 }}>{streak}</span>
      </div>
      <span style={{ fontSize: s.label, color: 'var(--text-muted)', fontWeight: '500' }}>일 연속</span>
    </motion.div>
  )
}
