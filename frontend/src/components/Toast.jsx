import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, Zap } from 'lucide-react'
import useStore from '../store/useStore'

const GREY = '#6B7280'

const TOAST_STYLES = {
  success: { bg: '#f0fdf4', border: '#86efac', Icon: CheckCircle,     color: '#15803d' },
  error:   { bg: '#fef2f2', border: '#fca5a5', Icon: XCircle,         color: '#b91c1c' },
  warning: { bg: '#fffbeb', border: '#fcd34d', Icon: AlertTriangle,    color: '#b45309' },
  info:    { bg: '#eff6ff', border: '#93c5fd', Icon: Info,             color: '#1d4ed8' },
  xp:      { bg: '#fffbeb', border: '#fcd34d', Icon: Zap,              color: '#d97706' },
}

export default function Toast() {
  const { toasts, removeToast } = useStore()

  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(toast => {
          const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info
          const { Icon } = style
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={() => removeToast(toast.id)}
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: '10px',
                minWidth: '240px', maxWidth: '340px',
                boxShadow: 'var(--shadow-lg)',
                cursor: 'pointer', pointerEvents: 'auto'
              }}
            >
              <Icon size={18} color={GREY} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                {toast.title && (
                  <div style={{ fontSize: '14px', fontWeight: '700', color: style.color, marginBottom: '2px' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: style.color, opacity: 0.85 }}>
                  {toast.message}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
