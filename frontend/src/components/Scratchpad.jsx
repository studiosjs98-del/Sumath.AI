import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, X } from 'lucide-react'
import { MathText } from './MathRenderer'

const GREY = '#6B7280'

export default function Scratchpad({ steps, onStepsChange }) {
  const [inputValue, setInputValue] = useState('')

  const addStep = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onStepsChange([...steps, trimmed])
    setInputValue('')
  }

  const removeStep = (idx) => onStepsChange(steps.filter((_, i) => i !== idx))

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addStep() }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Pencil size={14} color={GREY} strokeWidth={1.75} />
        <span style={{ fontWeight: '600', fontSize: '14px' }}>풀이 과정</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>단계별로 적어보세요</span>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <AnimatePresence>
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '10px 12px'
                }}
              >
                <span style={{
                  width: '22px', height: '22px', minWidth: '22px', borderRadius: '50%',
                  background: 'var(--primary)', color: 'white', fontSize: '11px', fontWeight: '700',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  <MathText text={step} />
                </span>
                <button
                  onClick={() => removeStep(i)}
                  style={{ background: 'transparent', color: GREY, padding: '0 2px', lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                  onMouseLeave={e => e.currentTarget.style.color = GREY}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {steps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              첫 번째 풀이 단계를 입력해보세요
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="풀이 단계 입력 (수식은 $x^2$ 형태로)..."
            style={{
              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)',
              fontSize: '14px', outline: 'none', transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            onClick={addStep}
            disabled={!inputValue.trim()}
            style={{
              padding: '10px 16px',
              background: inputValue.trim() ? 'var(--primary)' : 'var(--bg-gray)',
              color: inputValue.trim() ? 'white' : 'var(--text-muted)',
              borderRadius: '8px', fontWeight: '600', fontSize: '13px',
              transition: 'all 0.2s', cursor: inputValue.trim() ? 'pointer' : 'not-allowed'
            }}
          >추가</button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Enter로 빠르게 추가할 수 있어요. $수식$으로 수학 기호를 쓸 수 있어요.
        </div>
      </div>
    </div>
  )
}
