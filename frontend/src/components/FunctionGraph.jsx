import React, { useRef, useEffect, useState } from 'react'

// Logical canvas dimensions (DPR-scaled internally)
const LW = 480, LH = 290
const PAD = { t: 24, r: 22, b: 38, l: 50 }

// ── Expression preprocessor ────────────────────────────────────────────────────
function preprocessExpr(raw) {
  let s = raw
    .replace(/^\s*[yY]\s*=\s*/, '') // strip y=
    .trim()

  // Implicit multiplication: 2x → 2*x, 3( → 3*(, )x → )*x, )( → )*(
  s = s
    .replace(/(\d)(x)/gi, '$1*x')
    .replace(/(\d)\(/g, '$1*(')
    .replace(/\)(x)/gi, ')*x')
    .replace(/\)\(/g, ')*(')

  // Power operator
  s = s.replace(/\^/g, '**')

  // Math functions (negative lookbehind to avoid double-replacing Math.xxx)
  const fns = {
    sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
    ln: 'Math.log', log: 'Math.log10',
    sqrt: 'Math.sqrt', abs: 'Math.abs', exp: 'Math.exp'
  }
  for (const [fn, mathFn] of Object.entries(fns)) {
    s = s.replace(new RegExp(`(?<!Math\\.)\\b${fn}\\b`, 'g'), mathFn)
  }

  // Constants
  s = s.replace(/\bpi\b/gi, 'Math.PI').replace(/π/g, 'Math.PI')
  // Standalone e (not inside a word like "exp" or scientific notation like "2e3")
  s = s.replace(/\be\b/g, 'Math.E')

  return s
}

// ── Safe evaluator ─────────────────────────────────────────────────────────────
function safeEval(rawExpr, xVal) {
  const expr = preprocessExpr(rawExpr)

  // After stripping known Math identifiers, only digits, x, operators, parens, dots may remain
  const stripped = expr
    .replace(/Math\.(sin|cos|tan|log|log10|sqrt|abs|exp|E|PI)\b/g, '')
    .replace(/[0-9x\s\+\-\*\/\(\)\.]/g, '')

  if (stripped.length > 0) return null

  try {
    // eslint-disable-next-line no-new-func
    const r = Function('x', `"use strict"; try { const v=(${expr}); return (v!==null&&isFinite(v)&&!isNaN(v))?v:null; } catch(e){ return null; }`)(xVal)
    return r
  } catch {
    return null
  }
}

// ── Sample points across [xMin, xMax] ─────────────────────────────────────────
function computePoints(expr, xMin, xMax, n = 400) {
  const pts = []
  const dx = (xMax - xMin) / n
  for (let i = 0; i <= n; i++) {
    const x = xMin + i * dx
    pts.push({ x, y: safeEval(expr, x) })
  }
  return pts
}

// ── Compute a clean y range from the sampled points ───────────────────────────
function computeYRange(pts) {
  let valid = pts.map(p => p.y).filter(y => y !== null)
  if (!valid.length) return { yMin: -5, yMax: 5 }

  // Remove extreme outliers (handles tan discontinuities)
  const sorted = [...valid].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.05)]
  const q4 = sorted[Math.floor(sorted.length * 0.95)]
  valid = valid.filter(y => y >= q1 && y <= q4)
  if (!valid.length) return { yMin: -5, yMax: 5 }

  let lo = Math.min(...valid), hi = Math.max(...valid)
  if (lo === hi) { lo -= 2; hi += 2 }
  const pad = (hi - lo) * 0.13
  return { yMin: lo - pad, yMax: hi + pad }
}

// ── Nice tick interval ─────────────────────────────────────────────────────────
function niceStep(range, target = 6) {
  const rough = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)))
  const norm = rough / mag
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10
  return nice * mag
}

// ── Find key points numerically ────────────────────────────────────────────────
function findKeyPoints(expr, xMin, xMax, pts) {
  const res = { yIntercept: null, xIntercepts: [], extrema: [] }

  if (xMin <= 0 && 0 <= xMax) {
    const y = safeEval(expr, 0)
    if (y !== null) res.yIntercept = { y: +y.toFixed(4) }
  }

  // X-intercepts by sign change + bisection
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (a.y === null || b.y === null) continue
    if (Math.sign(a.y) !== 0 && Math.sign(a.y) !== Math.sign(b.y)) {
      let lo = a.x, hi = b.x
      for (let j = 0; j < 30; j++) {
        const mid = (lo + hi) / 2
        const ym = safeEval(expr, mid)
        if (ym === null) break
        if (Math.sign(ym) === Math.sign(safeEval(expr, lo))) lo = mid
        else hi = mid
      }
      const rx = +((lo + hi) / 2).toFixed(3)
      if (!res.xIntercepts.some(p => Math.abs(p.x - rx) < 0.05)) {
        res.xIntercepts.push({ x: rx })
      }
    }
  }

  // Local extrema by derivative sign change
  const h = (xMax - xMin) / 400
  let prevSlope = null
  for (let i = 2; i < pts.length - 2; i++) {
    const x = pts[i].x
    const y1 = safeEval(expr, x - h), y2 = safeEval(expr, x + h)
    if (y1 === null || y2 === null) { prevSlope = null; continue }
    const slope = (y2 - y1) / (2 * h)
    if (prevSlope !== null && Math.sign(prevSlope) !== 0 && Math.sign(prevSlope) !== Math.sign(slope)) {
      const ey = safeEval(expr, x)
      if (ey !== null && res.extrema.length < 4) {
        res.extrema.push({
          x: +x.toFixed(3),
          y: +ey.toFixed(3),
          type: prevSlope > 0 ? 'max' : 'min'
        })
      }
    }
    prevSlope = slope
  }

  return res
}

// ── Draw a single animation frame ─────────────────────────────────────────────
function drawFrame(ctx, pts, xMin, xMax, yMin, yMax, progress) {
  const plotW = LW - PAD.l - PAD.r
  const plotH = LH - PAD.t - PAD.b

  const toC = (wx, wy) => ({
    cx: PAD.l + (wx - xMin) / (xMax - xMin) * plotW,
    cy: PAD.t + (1 - (wy - yMin) / (yMax - yMin)) * plotH
  })
  const ox = Math.max(PAD.l, Math.min(PAD.l + plotW, toC(0, 0).cx))
  const oy = Math.max(PAD.t, Math.min(PAD.t + plotH, toC(0, 0).cy))

  // Background
  ctx.clearRect(0, 0, LW, LH)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, LW, LH)
  ctx.fillStyle = '#F8FAFC'
  ctx.fillRect(PAD.l, PAD.t, plotW, plotH)
  ctx.strokeStyle = '#E2E8F0'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD.l, PAD.t, plotW, plotH)

  // Grid lines
  const xStep = niceStep(xMax - xMin)
  const yStep = niceStep(yMax - yMin)

  ctx.strokeStyle = '#E5E7EB'
  ctx.lineWidth = 0.75
  ctx.setLineDash([])

  for (let gx = Math.ceil(xMin / xStep - 1e-9) * xStep; gx <= xMax + 1e-9; gx += xStep) {
    const { cx } = toC(gx, 0)
    ctx.beginPath(); ctx.moveTo(cx, PAD.t); ctx.lineTo(cx, PAD.t + plotH); ctx.stroke()
  }
  for (let gy = Math.ceil(yMin / yStep - 1e-9) * yStep; gy <= yMax + 1e-9; gy += yStep) {
    const { cy } = toC(0, gy)
    ctx.beginPath(); ctx.moveTo(PAD.l, cy); ctx.lineTo(PAD.l + plotW, cy); ctx.stroke()
  }

  // Axes
  ctx.strokeStyle = '#64748B'
  ctx.lineWidth = 1.5

  ctx.beginPath(); ctx.moveTo(PAD.l, oy); ctx.lineTo(PAD.l + plotW - 5, oy); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(PAD.l + plotW, oy)
  ctx.lineTo(PAD.l + plotW - 10, oy - 4.5)
  ctx.lineTo(PAD.l + plotW - 10, oy + 4.5)
  ctx.closePath(); ctx.fillStyle = '#64748B'; ctx.fill()

  ctx.beginPath(); ctx.moveTo(ox, PAD.t + plotH); ctx.lineTo(ox, PAD.t + 5); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ox, PAD.t)
  ctx.lineTo(ox - 4.5, PAD.t + 10)
  ctx.lineTo(ox + 4.5, PAD.t + 10)
  ctx.closePath(); ctx.fill()

  // Tick labels
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#64748B'

  ctx.textAlign = 'center'
  for (let gx = Math.ceil(xMin / xStep - 1e-9) * xStep; gx <= xMax + 1e-9; gx += xStep) {
    if (Math.abs(gx) < xStep * 0.01) continue
    const { cx } = toC(gx, 0)
    if (cx < PAD.l + 4 || cx > PAD.l + plotW - 4) continue
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, oy - 3); ctx.lineTo(cx, oy + 3); ctx.stroke()
    const lbl = Math.abs(gx - Math.round(gx)) < 1e-9 ? String(Math.round(gx)) : gx.toFixed(1)
    ctx.fillText(lbl, cx, oy + 15)
  }

  ctx.textAlign = 'right'
  for (let gy = Math.ceil(yMin / yStep - 1e-9) * yStep; gy <= yMax + 1e-9; gy += yStep) {
    if (Math.abs(gy) < yStep * 0.01) continue
    const { cy } = toC(0, gy)
    if (cy < PAD.t + 4 || cy > PAD.t + plotH - 4) continue
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox - 3, cy); ctx.lineTo(ox + 3, cy); ctx.stroke()
    const lbl = Math.abs(gy - Math.round(gy)) < 1e-9 ? String(Math.round(gy)) : gy.toFixed(1)
    ctx.fillText(lbl, ox - 7, cy + 4)
  }

  // Axis labels
  ctx.font = 'italic 12px Georgia, serif'
  ctx.fillStyle = '#334155'
  ctx.textAlign = 'left'
  ctx.fillText('x', PAD.l + plotW + 4, oy + 4)
  ctx.textAlign = 'center'
  ctx.fillText('y', ox, PAD.t - 8)

  // ── Animated curve ──────────────────────────────────────────────────────────
  const drawCount = Math.floor(pts.length * progress)
  ctx.strokeStyle = '#2563EB'
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])

  let inPath = false
  ctx.beginPath()

  for (let i = 0; i < drawCount; i++) {
    const pt = pts[i]
    if (pt.y === null) { inPath = false; continue }

    const { cx } = toC(pt.x, 0)
    const rawCy = toC(0, pt.y).cy

    // Break path on discontinuities (e.g. tan asymptotes)
    if (inPath && i > 0 && pts[i - 1].y !== null) {
      if (Math.abs(rawCy - toC(0, pts[i - 1].y).cy) > plotH * 0.55) {
        inPath = false
      }
    }

    const cy = Math.max(PAD.t - 2, Math.min(PAD.t + plotH + 2, rawCy))

    if (!inPath) { ctx.moveTo(cx, cy); inPath = true }
    else ctx.lineTo(cx, cy)
  }
  ctx.stroke()
}

// ── Key point info bar ─────────────────────────────────────────────────────────
function KeyInfo({ kp }) {
  const items = []
  if (kp.yIntercept !== null) items.push(`y절편: (0, ${kp.yIntercept.y})`)
  if (kp.xIntercepts.length > 0) {
    items.push(`x절편: ${kp.xIntercepts.slice(0, 4).map(p => `(${p.x}, 0)`).join(', ')}`)
  }
  kp.extrema.slice(0, 2).forEach(e => {
    items.push(`${e.type === 'max' ? '극대' : '극소'}: (${e.x}, ${e.y})`)
  })
  if (!items.length) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
      padding: '8px 14px', borderTop: '1px solid #BFDBFE',
      background: '#F8FAFC', fontSize: 12, color: '#374151',
      fontFamily: "'Noto Sans KR', sans-serif"
    }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563EB', display: 'inline-block', flexShrink: 0 }} />
          {item}
        </span>
      ))}
    </div>
  )
}

// ── Main exported component ────────────────────────────────────────────────────
export default function FunctionGraph({ func, xMin = -5, xMax = 5, label }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const [keyPts, setKeyPts] = useState(null)
  const [valid, setValid] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Quick validity check
    const t0 = safeEval(func, 0), t1 = safeEval(func, 1), t2 = safeEval(func, -1)
    if (t0 === null && t1 === null && t2 === null) { setValid(false); return }
    setValid(true)

    // DPR-aware canvas setup
    const DPR = window.devicePixelRatio || 1
    canvas.width = LW * DPR
    canvas.height = LH * DPR
    const ctx = canvas.getContext('2d')
    ctx.scale(DPR, DPR)

    // Pre-compute data
    const pts = computePoints(func, xMin, xMax, 400)
    const { yMin, yMax } = computeYRange(pts)
    setKeyPts(findKeyPoints(func, xMin, xMax, pts))

    // Animate curve drawing
    const DURATION = 850
    let start = null

    const animate = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / DURATION, 1)
      drawFrame(ctx, pts, xMin, xMax, yMin, yMax, progress)
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [func, xMin, xMax])

  if (!valid) return null

  return (
    <div style={{
      margin: '14px 0', border: '1px solid #BFDBFE',
      borderRadius: 12, overflow: 'hidden', background: '#fff'
    }}>
      {label && (
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid #BFDBFE',
          fontSize: 13, fontWeight: 600, color: '#1E3A8A', background: '#EFF6FF'
        }}>
          {label}
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
      {keyPts && <KeyInfo kp={keyPts} />}
    </div>
  )
}
