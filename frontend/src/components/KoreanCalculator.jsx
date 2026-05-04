import React, { useState, useRef, useCallback } from 'react'
import { X, Delete } from 'lucide-react'
import { create, all } from 'mathjs'

const math = create(all)

// ── Button definitions ────────────────────────────────────────────────────────
// type: 'num' | 'op' | 'fn' | 'action' | 'equals'
const BUTTONS = [
  // Row 1
  { label: '라디안', labelDeg: '도', type: 'action', id: 'deg' },
  { label: '(', type: 'op', value: '(' },
  { label: ')', type: 'op', value: ')' },
  { label: '전체 지우기', type: 'action', id: 'clear', span: 2 },

  // Row 2
  { label: 'sin', type: 'fn', value: 'sin(' },
  { label: 'cos', type: 'fn', value: 'cos(' },
  { label: 'tan', type: 'fn', value: 'tan(' },
  { label: 'π', type: 'num', value: 'π' },
  { label: 'e', type: 'num', value: 'e' },

  // Row 3
  { label: 'sin⁻¹', type: 'fn', value: 'asin(' },
  { label: 'cos⁻¹', type: 'fn', value: 'acos(' },
  { label: 'tan⁻¹', type: 'fn', value: 'atan(' },
  { label: 'xʸ', type: 'op', value: '^' },
  { label: 'x²', type: 'action', id: 'square' },

  // Row 4
  { label: 'log', type: 'fn', value: 'log10(' },
  { label: 'ln', type: 'fn', value: 'log(' },
  { label: '√', type: 'fn', value: 'sqrt(' },
  { label: '7', type: 'num', value: '7' },
  { label: '8', type: 'num', value: '8' },

  // Row 5 — continues nums
  { label: '9', type: 'num', value: '9' },
  { label: '÷', type: 'op', value: '/' },
  { label: '4', type: 'num', value: '4' },
  { label: '5', type: 'num', value: '5' },
  { label: '6', type: 'num', value: '6' },

  // Row 6
  { label: '×', type: 'op', value: '*' },
  { label: '1', type: 'num', value: '1' },
  { label: '2', type: 'num', value: '2' },
  { label: '3', type: 'num', value: '3' },
  { label: '−', type: 'op', value: '-' },

  // Row 7
  { label: '0', type: 'num', value: '0', span: 2 },
  { label: '.', type: 'num', value: '.' },
  { label: '+', type: 'op', value: '+' },
  { label: '=', type: 'equals', id: 'eval' },
]

// Layout rows (indices into BUTTONS)
const ROWS = [
  [0, 1, 2, 3],          // deg | ( | ) | 전체 지우기
  [4, 5, 6, 7, 8],       // sin cos tan π e
  [9, 10, 11, 12, 13],   // sin⁻¹ cos⁻¹ tan⁻¹ xʸ x²
  [14, 15, 16, 17, 18],  // log ln √ 7 8
  [19, 20, 21, 22, 23],  // 9 ÷ 4 5 6
  [24, 25, 26, 27, 28],  // × 1 2 3 −
  [29, 30, 31, 32],      // 0(wide) . + =
]

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  num:    { bg: '#ffffff', fg: '#111827', hover: '#f3f4f6' },
  op:     { bg: '#f3f4f6', fg: '#374151', hover: '#e5e7eb' },
  fn:     { bg: '#eef2ff', fg: '#4338ca', hover: '#e0e7ff' },
  action: { bg: '#fef3c7', fg: '#92400e', hover: '#fde68a' },
  equals: { bg: '#4F7EFF', fg: '#ffffff', hover: '#3b6de8' },
}

function autoClose(expr) {
  const opens = (expr.match(/\(/g) || []).length
  const closes = (expr.match(/\)/g) || []).length
  return expr + ')'.repeat(Math.max(0, opens - closes))
}

function evalExpr(expr, deg) {
  let e = expr
    .replace(/π/g, 'pi')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')

  if (deg) {
    // wrap trig inputs in deg→rad: sin(x) → sin(x * pi/180)
    // but leave asin/acos/atan output conversion (they return radians → convert to deg)
    e = e
      .replace(/\bsin\(/g, 'sin(')
      .replace(/\bcos\(/g, 'cos(')
      .replace(/\btan\(/g, 'tan(')
  }

  // Auto-close unclosed parens
  e = autoClose(e)

  if (deg) {
    const scope = {
      sin: x => Math.sin(x * Math.PI / 180),
      cos: x => Math.cos(x * Math.PI / 180),
      tan: x => Math.tan(x * Math.PI / 180),
      asin: x => Math.asin(x) * 180 / Math.PI,
      acos: x => Math.acos(x) * 180 / Math.PI,
      atan: x => Math.atan(x) * 180 / Math.PI,
    }
    return math.evaluate(e, scope)
  }
  return math.evaluate(e)
}

function fmtResult(val) {
  if (typeof val === 'number') {
    if (!isFinite(val)) return '오류'
    // up to 10 sig figs, strip trailing zeros
    const s = parseFloat(val.toPrecision(10)).toString()
    return s
  }
  return String(val)
}

export default function KoreanCalculator({ onClose }) {
  const [expr, setExpr]       = useState('')
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(false)
  const [deg, setDeg]         = useState(false)
  const [history, setHistory] = useState([])
  const [showHist, setShowHist] = useState(false)

  const dragRef = useRef(null)
  const defaultPos = () => ({
    x: Math.max(20, window.innerWidth - 450),
    y: Math.max(20, window.innerHeight - 620),
  })
  const [pos, setPos] = useState(defaultPos)

  const onMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX - pos.x
    const startY = e.clientY - pos.y
    dragRef.current = { startX, startY }
    const onMove = (ev) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 420, ev.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 560, ev.clientY - dragRef.current.startY)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const press = useCallback((btn) => {
    setError(false)
    setResult(null)

    if (btn.id === 'clear') { setExpr(''); setResult(null); return }
    if (btn.id === 'deg')   { setDeg(d => !d); return }
    if (btn.id === 'square') {
      setExpr(e => e ? `(${e})^2` : '')
      return
    }
    if (btn.id === 'eval') {
      if (!expr) return
      try {
        const val = evalExpr(expr, deg)
        const r = fmtResult(val)
        setResult(r)
        setHistory(h => [`${expr} = ${r}`, ...h].slice(0, 20))
      } catch {
        setError(true)
        setResult('오류')
      }
      return
    }
    if (btn.type === 'equals') return

    const v = btn.value ?? btn.label
    setExpr(e => {
      // If we just got a result, start fresh unless continuing with operator
      if (result !== null && btn.type === 'num') return v
      if (result !== null && btn.type === 'fn')  return v
      if (result !== null && btn.type === 'op')  return (result ?? '') + v
      return e + v
    })
    if (result !== null) setResult(null)
  }, [expr, result, deg])

  // Backspace
  const backspace = () => {
    setError(false)
    setResult(null)
    setExpr(e => e.slice(0, -1))
  }

  const displayExpr = expr || ' '
  const displayResult = result !== null ? result : ''

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y,
      width: 420, zIndex: 1000,
      borderRadius: 16, border: '1px solid #e5e7eb',
      boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      background: '#fff',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', userSelect: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Header */}
      <div onMouseDown={onMouseDown} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb', cursor: 'grab', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>계산기</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setShowHist(h => !h)} style={iconBtn}
            title="기록">
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>기록</span>
          </button>
          <button onClick={onClose} style={iconBtn}>
            <X size={15} strokeWidth={2} color="#9ca3af" />
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHist && (
        <div style={{
          maxHeight: 140, overflowY: 'auto', background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb', padding: '6px 12px',
        }}>
          {history.length === 0
            ? <span style={{ fontSize: 11, color: '#9ca3af' }}>기록 없음</span>
            : history.map((h, i) => (
              <div key={i} style={{ fontSize: 11, color: '#6b7280', padding: '2px 0',
                borderBottom: i < history.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                {h}
              </div>
            ))}
        </div>
      )}

      {/* Display */}
      <div style={{
        background: '#1e1e2e', padding: '12px 16px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, color: '#6b7280', alignSelf: 'flex-start' }}>
          {deg ? '도 (°)' : '라디안 (rad)'}
        </div>
        <div style={{
          fontSize: 15, color: error ? '#f87171' : '#94a3b8',
          minHeight: 22, wordBreak: 'break-all', textAlign: 'right', width: '100%',
        }}>
          {displayExpr}
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700,
          color: error ? '#f87171' : '#f1f5f9',
          minHeight: 34, textAlign: 'right',
        }}>
          {displayResult}
        </div>
      </div>

      {/* Keypad */}
      <div style={{ padding: '10px 10px 12px', background: '#fff' }}>
        {ROWS.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
            {row.map(bi => {
              const btn = BUTTONS[bi]
              const isWide = btn.span === 2
              const isDegBtn = btn.id === 'deg'
              const label = isDegBtn ? (deg ? '도' : '라디안') : btn.label
              const col = C[btn.type] || C.num
              return (
                <button
                  key={bi}
                  onClick={() => {
                    if (btn.id === 'deg') { setDeg(d => !d); return }
                    press(btn)
                  }}
                  style={{
                    flex: isWide ? 2 : 1,
                    padding: '9px 4px',
                    fontSize: btn.type === 'action' && btn.id === 'clear' ? 10
                            : btn.type === 'fn' ? 12 : 14,
                    fontWeight: btn.type === 'equals' ? 700 : 500,
                    background: col.bg,
                    color: col.fg,
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = col.hover}
                  onMouseOut={e => e.currentTarget.style.background = col.bg}
                >
                  {label}
                </button>
              )
            })}
            {/* Add backspace button at end of last row */}
            {ri === ROWS.length - 1 && (
              <button
                onClick={backspace}
                style={{
                  flex: 1, padding: '9px 4px',
                  background: C.action.bg, color: C.action.fg,
                  border: '1px solid #e5e7eb', borderRadius: 8,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.1s',
                }}
                title="지우기"
                onMouseOver={e => e.currentTarget.style.background = C.action.hover}
                onMouseOut={e => e.currentTarget.style.background = C.action.bg}
              >
                <Delete size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '3px 6px', borderRadius: 4,
}
