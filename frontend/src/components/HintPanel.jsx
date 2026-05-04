import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Plus, Bot, ChevronDown, Settings } from 'lucide-react'
import api from '../utils/api'
import { MathText } from './MathRenderer'
import { playHintSound } from '../utils/audio'

const GREY = '#6B7280'

export default function HintPanel({ problem, studentSteps, onHintUsed }) {
  const [hints, setHints] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [useAI, setUseAI] = useState(false)

  const staticHints = problem.hints || []

  const requestHint = async () => {
    playHintSound()
    setExpanded(true)

    if (!useAI && hints.length < staticHints.length) {
      setHints(prev => [...prev, staticHints[hints.length]])
      onHintUsed?.()
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/hints/hint', {
        problemId: problem.id,
        studentSteps,
        hintNumber: hints.length + 1,
        previousHints: hints
      })
      setHints(prev => [...prev, res.data.hint])
      onHintUsed?.()
    } catch {
      setHints(prev => [...prev, '힌트를 불러오는 중 오류가 발생했습니다.'])
    } finally {
      setLoading(false)
    }
  }

  const canGetMore = hints.length < staticHints.length || useAI

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '14px 16px', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', cursor: 'pointer'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lightbulb size={16} color={GREY} strokeWidth={1.75} />
          힌트 ({hints.length}/{staticHints.length})
        </span>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} style={{ display: 'inline-flex' }}>
          <ChevronDown size={16} color={GREY} strokeWidth={1.75} />
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px' }}>
              {hints.map((hint, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: 'var(--bg-gray)', border: '1px solid var(--border)',
                    borderRadius: '8px', padding: '12px', marginBottom: '8px'
                  }}
                >
                  <div style={{ fontSize: '11px', color: GREY, fontWeight: '600', marginBottom: '4px' }}>
                    힌트 {i + 1}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
                    <MathText text={hint} />
                  </div>
                </motion.div>
              ))}

              {loading && (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
                    <Settings size={14} color={GREY} strokeWidth={1.75} />
                  </motion.span>
                  AI 튜터가 생각 중...
                </div>
              )}

              {!loading && canGetMore && (
                <button
                  onClick={requestHint}
                  style={{
                    width: '100%', padding: '10px',
                    background: 'var(--bg-gray)', border: '1px dashed var(--border)',
                    borderRadius: '8px', color: GREY, fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', marginTop: hints.length > 0 ? '4px' : '0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  {hints.length === 0
                    ? <><Lightbulb size={14} color={GREY} strokeWidth={1.75} /> 첫 번째 힌트 받기</>
                    : <><Plus size={14} color={GREY} strokeWidth={1.75} /> 다음 힌트 받기</>}
                </button>
              )}

              {hints.length >= staticHints.length && !useAI && (
                <button
                  onClick={() => setUseAI(true)}
                  style={{
                    width: '100%', padding: '10px', marginTop: '4px',
                    background: 'var(--bg-gray)', border: '1px dashed var(--border)',
                    borderRadius: '8px', color: GREY, fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  <Bot size={14} color={GREY} strokeWidth={1.75} />
                  AI 튜터에게 더 물어보기
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
