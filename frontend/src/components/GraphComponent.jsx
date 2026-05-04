import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

const COLORS = ['#4F7EFF', '#FF6B6B', '#00C49F', '#FFB347', '#A78BFA', '#F472B6']
const DEFAULT_VIEW = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
const CANVAS_HEIGHT = 450   // logical CSS height of the canvas
const H_ASYMPTOTE_X = 1e4   // x value used to probe horizontal asymptotes

// ── Expression preprocessor ────────────────────────────────────────────────────
function preprocess(raw) {
  return raw
    .replace(/^\s*[yY]\s*=\s*/, '')
    .trim()
    .replace(/\^/g, '**')
    .replace(/(\d)(x)/gi, '$1*x')
    .replace(/(\d)\(/g, '$1*(')
    .replace(/\)(x)/gi, ')*x')
    .replace(/\)\(/g, ')*(')
    .replace(/(?<!Math\.)(?<!\w)(sin)\b/g, 'Math.sin')
    .replace(/(?<!Math\.)(?<!\w)(cos)\b/g, 'Math.cos')
    .replace(/(?<!Math\.)(?<!\w)(tan)\b/g, 'Math.tan')
    .replace(/(?<!Math\.)(?<!\w)(sqrt)\b/g, 'Math.sqrt')
    .replace(/(?<!Math\.)(?<!\w)(abs)\b/g, 'Math.abs')
    .replace(/(?<!Math\.)(?<!\w)(exp)\b/g, 'Math.exp')
    .replace(/(?<!Math\.)(?<!\w)(ln)\b/g, 'Math.log')
    .replace(/(?<!Math\.)(?<!\w)(log)\b/g, 'Math.log10')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
}

// Cache compiled functions to avoid repeated `new Function` calls
const fnCache = new Map()
function compileFn(eq) {
  if (fnCache.has(eq)) return fnCache.get(eq)
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `"use strict"; try { const r=(${preprocess(eq.replace(/^[yY]\s*=\s*/, ''))}); return (r!==null&&isFinite(r)&&!isNaN(r))?r:null; } catch(e){ return null; }`)
    fnCache.set(eq, fn)
    return fn
  } catch {
    fnCache.set(eq, () => null)
    return fnCache.get(eq)
  }
}

function evalAt(eq, x) {
  const exprOnly = eq.replace(/^[yY]\s*=\s*/, '')
  try { return compileFn(exprOnly)(x) } catch { return null }
}

function niceStep(range, target = 8) {
  const rough = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)))
  const norm = rough / mag
  return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag
}

function fmt(n) {
  if (Math.abs(n) >= 1000) return n.toExponential(0)
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1)
}

function fmt2(n) {
  if (Math.abs(n) < 1e-9) return '0'
  if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n))
  return n.toFixed(2)
}

// ── Smart bounds ───────────────────────────────────────────────────────────────
function isTrigEquations(equations) {
  return equations.some(e => /Math\.(sin|cos|tan)|sin|cos|tan/.test(e))
}

function getDefaultXBounds(expression) {
  if (/sin|cos|tan/.test(expression)) return { xMin: -Math.PI * 2, xMax: Math.PI * 2 }
  return { xMin: -5, xMax: 5 }
}

function getGraphBounds(fn, xMin, xMax) {
  const steps = 200
  const dx = (xMax - xMin) / steps
  let yMin = Infinity, yMax = -Infinity
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * dx
    const y = fn(x)
    if (isFinite(y)) {
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)
    }
  }
  const yPad = (yMax - yMin) * 0.2 || 5
  return { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad }
}

function niceInterval(range, count) {
  const rough = range / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough || 1)))
  return Math.ceil(rough / magnitude) * magnitude
}

// ── Format x value as π fraction for trig graphs ──────────────────────────────
function fmtPi(x) {
  const PI = Math.PI
  const known = [
    [0, '0'], [PI / 6, 'π/6'], [PI / 4, 'π/4'], [PI / 3, 'π/3'],
    [PI / 2, 'π/2'], [2 * PI / 3, '2π/3'], [3 * PI / 4, '3π/4'],
    [PI, 'π'], [5 * PI / 4, '5π/4'], [3 * PI / 2, '3π/2'],
    [7 * PI / 4, '7π/4'], [2 * PI, '2π'],
  ]
  for (const [val, label] of known) {
    if (Math.abs(x - val) < 1e-6) return label
  }
  const n = Math.round(x / (PI / 2))
  if (Math.abs(x - n * PI / 2) < 0.01) {
    if (n === 0) return '0'
    if (n % 2 === 0) return n === 2 ? 'π' : `${n / 2}π`
    return n === 1 ? 'π/2' : `${n}π/2`
  }
  return fmt(x)
}

// ── Auto-compute a sensible view from the equations ───────────────────────────
function autoView(equations) {
  if (!equations.length) return DEFAULT_VIEW
  const eq = equations[0]
  const { xMin, xMax } = getDefaultXBounds(eq)
  const fn = x => evalAt(eq, x)
  return getGraphBounds(fn, xMin, xMax)
}

// ── Key point detection ────────────────────────────────────────────────────────
function findKeyPoints(eq, xMin, xMax) {
  const N = 600
  const step = (xMax - xMin) / N
  const h = 1e-4

  const d1 = x => {
    const a = evalAt(eq, x - h), b = evalAt(eq, x + h)
    return (a !== null && b !== null) ? (b - a) / (2 * h) : null
  }
  const d2 = x => {
    const a = d1(x - h), b = d1(x + h)
    return (a !== null && b !== null) ? (b - a) / (2 * h) : null
  }

  // Sample y and d1 values
  const ys = [], ds = []
  for (let i = 0; i <= N; i++) {
    const x = xMin + i * step
    ys.push({ x, y: evalAt(eq, x) })
    ds.push({ x, d: d1(x) })
  }

  const result = { yIntercept: null, xIntercepts: [], extrema: [], inflections: [], vAsymptotes: [], hAsymptotes: [] }

  // Y-intercept
  if (xMin <= 0 && 0 <= xMax) {
    const y = evalAt(eq, 0)
    if (y !== null) result.yIntercept = { x: 0, y }
  }

  // X-intercepts — sign change + bisection
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1], b = ys[i]
    if (a.y === null || b.y === null) continue
    if (Math.abs(a.y) > 200 || Math.abs(b.y) > 200) continue   // skip near asymptotes
    if (Math.sign(a.y) !== 0 && Math.sign(b.y) !== 0 && Math.sign(a.y) !== Math.sign(b.y)) {
      let lo = a.x, hi = b.x
      for (let j = 0; j < 50; j++) {
        const mid = (lo + hi) / 2
        const ym = evalAt(eq, mid)
        if (ym === null) break
        if (Math.sign(ym) === Math.sign(evalAt(eq, lo))) lo = mid; else hi = mid
      }
      const rx = (lo + hi) / 2
      if (result.xIntercepts.every(p => Math.abs(p.x - rx) > 0.05)) {
        result.xIntercepts.push({ x: rx, y: 0 })
      }
    }
    if (result.xIntercepts.length >= 8) break
  }

  // Extrema — sign change of d1 + bisection on d1
  for (let i = 1; i < ds.length; i++) {
    const a = ds[i - 1], b = ds[i]
    if (a.d === null || b.d === null) continue
    if (Math.abs(a.d) > 500 || Math.abs(b.d) > 500) continue
    if (Math.sign(a.d) !== 0 && Math.sign(b.d) !== 0 && Math.sign(a.d) !== Math.sign(b.d)) {
      let lo = a.x, hi = b.x
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2
        const dm = d1(mid)
        if (dm === null) break
        if (Math.sign(dm) === Math.sign(d1(lo))) lo = mid; else hi = mid
      }
      const ex = (lo + hi) / 2
      const ey = evalAt(eq, ex)
      if (ey !== null && Math.abs(ey) < 1e6) {
        const isMax = a.d > 0
        if (result.extrema.every(p => Math.abs(p.x - ex) > 0.05)) {
          result.extrema.push({ x: ex, y: ey, type: isMax ? 'max' : 'min' })
        }
      }
    }
    if (result.extrema.length >= 6) break
  }

  // Inflection points — sign change of d2
  const d2s = ys.map(s => ({ x: s.x, d: d2(s.x) }))
  for (let i = 1; i < d2s.length; i++) {
    const a = d2s[i - 1], b = d2s[i]
    if (a.d === null || b.d === null) continue
    if (Math.abs(a.d) > 500 || Math.abs(b.d) > 500) continue
    if (Math.sign(a.d) !== 0 && Math.sign(b.d) !== 0 && Math.sign(a.d) !== Math.sign(b.d)) {
      let lo = a.x, hi = b.x
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2
        const dm = d2(mid)
        if (dm === null) break
        if (Math.sign(dm) === Math.sign(d2(lo))) lo = mid; else hi = mid
      }
      const ix = (lo + hi) / 2
      const iy = evalAt(eq, ix)
      if (iy !== null && Math.abs(iy) < 1e6) {
        const nearExtremum = result.extrema.some(e => Math.abs(e.x - ix) < 0.1)
        if (!nearExtremum && result.inflections.every(p => Math.abs(p.x - ix) > 0.1)) {
          result.inflections.push({ x: ix, y: iy })
        }
      }
    }
    if (result.inflections.length >= 4) break
  }

  // Vertical asymptotes — large |y| jump with sign change
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1], b = ys[i]
    if (a.y === null || b.y === null) continue
    if (Math.abs(a.y) > 300 && Math.abs(b.y) > 300 && Math.sign(a.y) !== Math.sign(b.y)) {
      const ax = (a.x + b.x) / 2
      if (result.vAsymptotes.every(v => Math.abs(v.x - ax) > 0.2)) {
        result.vAsymptotes.push({ x: ax })
      }
    }
  }

  // Horizontal asymptotes — check f at large |x|
  const yFar = [evalAt(eq, H_ASYMPTOTE_X), evalAt(eq, -H_ASYMPTOTE_X)]
  yFar.forEach(yf => {
    if (yf !== null && Math.abs(yf) < 1e6) {
      const rounded = Math.round(yf * 1000) / 1000
      if (result.hAsymptotes.every(h => Math.abs(h.y - rounded) > 0.01)) {
        result.hAsymptotes.push({ y: rounded })
      }
    }
  })

  return result
}

// ── Draw a labelled point with smart positioning ───────────────────────────────
function drawPoint(ctx, cx, cy, color, label, W, H) {
  // Dot
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!label) return

  ctx.font = 'bold 11px system-ui, sans-serif'
  const tw = ctx.measureText(label).width
  const th = 13
  const PAD = 3

  // Try 4 positions: right-above, left-above, right-below, left-below
  const positions = [
    { dx: 9, dy: -9 },
    { dx: -tw - 9, dy: -9 },
    { dx: 9, dy: th + 5 },
    { dx: -tw - 9, dy: th + 5 },
  ]
  let pos = positions[0]
  for (const p of positions) {
    const rx = cx + p.dx, ry = cy + p.dy
    if (rx >= PAD && rx + tw <= W - PAD && ry - th >= PAD && ry <= H - PAD) { pos = p; break }
  }

  const lx = cx + pos.dx, ly = cy + pos.dy
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillRect(lx - PAD, ly - th - PAD + 2, tw + PAD * 2, th + PAD * 2)
  ctx.fillStyle = '#111827'
  ctx.textAlign = 'left'
  ctx.fillText(label, lx, ly)
}

// ── Canvas draw ────────────────────────────────────────────────────────────────
function drawGraph(canvas, view, equations, usePiLabels = false, kpPerEq = null) {
  const ctx = canvas.getContext('2d')
  const DPR = window.devicePixelRatio || 1
  const W = canvas.width / DPR
  const H = canvas.height / DPR
  const { xMin, xMax, yMin, yMax } = view

  // Independent scales for x and y — no equal-aspect distortion
  const scaleX = W / (xMax - xMin)
  const scaleY = H / (yMax - yMin)
  const toX = wx => (wx - xMin) * scaleX
  const toY = wy => H - (wy - yMin) * scaleY
  const inView = (cx, cy) => cx >= 0 && cx <= W && cy >= 0 && cy <= H

  const xTickInterval = niceInterval(xMax - xMin, 10)
  const yTickInterval = niceInterval(yMax - yMin, 8)

  ctx.save()
  ctx.scale(DPR, DPR)

  // Background
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)

  // Grid
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 1
  for (let gx = Math.ceil(xMin / xTickInterval - 1e-9) * xTickInterval; gx <= xMax + 1e-9; gx += xTickInterval) {
    const cx = toX(gx)
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
  }
  for (let gy = Math.ceil(yMin / yTickInterval - 1e-9) * yTickInterval; gy <= yMax + 1e-9; gy += yTickInterval) {
    const cy = toY(gy)
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()
  }

  // Axes
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1.5
  const ox = Math.max(0, Math.min(W, toX(0)))
  const oy = Math.max(0, Math.min(H, toY(0)))
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke()

  // Axis tick labels
  ctx.font = `${11 * Math.min(1, W / 400)}px system-ui, sans-serif`
  ctx.fillStyle = '#6B7280'
  ctx.textAlign = 'center'
  for (let gx = Math.ceil(xMin / xTickInterval - 1e-9) * xTickInterval; gx <= xMax + 1e-9; gx += xTickInterval) {
    if (Math.abs(gx) < xTickInterval * 0.01) continue
    const cx = toX(gx)
    if (cx < 10 || cx > W - 10) continue
    ctx.fillText(usePiLabels ? fmtPi(gx) : fmt(gx), cx, Math.max(14, Math.min(H - 4, oy + 14)))
  }
  ctx.textAlign = 'right'
  for (let gy = Math.ceil(yMin / yTickInterval - 1e-9) * yTickInterval; gy <= yMax + 1e-9; gy += yTickInterval) {
    if (Math.abs(gy) < yTickInterval * 0.01) continue
    const cy = toY(gy)
    if (cy < 10 || cy > H - 10) continue
    ctx.fillText(fmt(gy), Math.max(50, Math.min(W - 4, ox - 5)), cy + 4)
  }

  // Per-equation: curves + key points
  equations.forEach((eq, idx) => {
    if (!eq.trim()) return
    const color = COLORS[idx % COLORS.length]

    // ── Vertical asymptotes (dashed, before curve) ──
    const kp = kpPerEq?.[idx] ?? findKeyPoints(eq, xMin, xMax)

    kp.vAsymptotes.forEach(va => {
      const cx = toX(va.x)
      ctx.save()
      ctx.strokeStyle = `${color}88`
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = cx < W / 2 ? 'left' : 'right'
      ctx.fillText(`점근선 x=${fmt2(va.x)}`, cx < W / 2 ? cx + 4 : cx - 4, 16)
      ctx.restore()
    })

    // ── Horizontal asymptotes (dashed) ──
    kp.hAsymptotes.forEach(ha => {
      if (ha.y < yMin || ha.y > yMax) return
      const cy = toY(ha.y)
      ctx.save()
      ctx.strokeStyle = `${color}66`
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = 'right'
      ctx.fillText(`점근선 y=${fmt2(ha.y)}`, W - 4, cy - 4)
      ctx.restore()
    })

    // ── Curve ──
    const steps = Math.ceil(W * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    ctx.beginPath()
    let drawing = false
    let prevCy = null
    for (let s = 0; s <= steps; s++) {
      const wx = xMin + (s / steps) * (xMax - xMin)
      const wy = evalAt(eq, wx)
      if (wy === null) { drawing = false; prevCy = null; continue }
      const cx = toX(wx)
      const cy = toY(wy)
      if (drawing && prevCy !== null && Math.abs(cy - prevCy) > H * 0.6) drawing = false
      if (!drawing) { ctx.moveTo(cx, cy); drawing = true }
      else ctx.lineTo(cx, cy)
      prevCy = cy
    }
    ctx.stroke()

    // ── Key point dots: x-intercepts + extrema ──
    const drawDot = (cx, cy, r = 4) => {
      if (!inView(cx, cy)) return
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.save()
    kp.xIntercepts.forEach(p => drawDot(toX(p.x), toY(0)))
    kp.extrema.forEach(p => drawDot(toX(p.x), toY(p.y), 5))
    ctx.restore()
  })

  ctx.restore()
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GraphComponent({ equations: initialEquations = [], title, titleHtml, height: canvasHeight = 450, compact = false }) {
  const [equations, setEquations] = useState(() => initialEquations.length ? initialEquations : [])
  const [view, setView] = useState(() => autoView(initialEquations.length ? initialEquations : []))
  const [input, setInput] = useState('')
  const [tooltip, setTooltip] = useState({ visible: false })
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const usePiLabels = isTrigEquations(equations)

  // Pre-compute key points (shared between draw and hover)
  const kpPerEq = useMemo(
    () => equations.map(eq => findKeyPoints(eq, view.xMin, view.xMax)),
    [equations, view.xMin, view.xMax]
  )

  // Flat list used for proximity hover detection
  const keyPoints = useMemo(() => {
    const pts = []
    equations.forEach((eq, idx) => {
      const color = COLORS[idx % COLORS.length]
      const kp = kpPerEq[idx]
      kp.xIntercepts.forEach(p => pts.push({ x: p.x, y: 0,    label: 'x절편', color }))
      kp.extrema.forEach(p =>     pts.push({ x: p.x, y: p.y,  label: p.type === 'max' ? '극대' : '극소', color }))
    })
    return pts
  }, [kpPerEq, equations])

  // Hide tooltip whenever view changes (points shift position)
  useEffect(() => { setTooltip({ visible: false }) }, [view])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const DPR = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * DPR
    canvas.height = canvasHeight * DPR
    drawGraph(canvas, view, equations, usePiLabels, kpPerEq)
  }, [equations, view, usePiLabels, canvasHeight, kpPerEq])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const DPR = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * DPR
      canvas.height = canvasHeight * DPR
      drawGraph(canvas, view, equations, usePiLabels, kpPerEq)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [equations, view, usePiLabels, kpPerEq])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = e => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.12 : 0.89
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top) / rect.height
      setView(v => {
        const wxM = v.xMin + mx * (v.xMax - v.xMin)
        const wyM = v.yMin + (1 - my) * (v.yMax - v.yMin)
        return {
          xMin: wxM + (v.xMin - wxM) * factor,
          xMax: wxM + (v.xMax - wxM) * factor,
          yMin: wyM + (v.yMin - wyM) * factor,
          yMax: wyM + (v.yMax - wyM) * factor,
        }
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = useCallback(e => {
    setTooltip({ visible: false })
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, view: { ...view }, rectW: rect.width, rectH: rect.height }
  }, [view])

  const onMouseMove = useCallback(e => {
    // ── Drag panning ──────────────────────────────────────────────────────────
    if (dragRef.current) {
      const { startX, startY, view: v, rectW, rectH } = dragRef.current
      const dx = (e.clientX - startX) / rectW * (v.xMax - v.xMin)
      const dy = (e.clientY - startY) / rectH * (v.yMax - v.yMin)
      setView({ xMin: v.xMin - dx, xMax: v.xMax - dx, yMin: v.yMin + dy, yMax: v.yMax + dy })
      return
    }

    // ── Proximity check against pre-calculated key points only ────────────────
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const { xMin, xMax, yMin, yMax } = view
    const scX = rect.width / (xMax - xMin)
    const scY = rect.height / (yMax - yMin)
    const toPixelX = mx => (mx - xMin) * scX
    const toPixelY = my => rect.height - (my - yMin) * scY

    const nearby = keyPoints.find(pt =>
      Math.hypot(mouseX - toPixelX(pt.x), mouseY - toPixelY(pt.y)) < 12
    )

    if (nearby) {
      setTooltip({
        visible: true,
        pixelX: toPixelX(nearby.x),
        dotY:   toPixelY(nearby.y),
        label:  `${nearby.label} (${nearby.x.toFixed(2)}, ${nearby.y.toFixed(2)})`,
        color:  nearby.color,
        containerWidth: rect.width,
      })
    } else {
      setTooltip({ visible: false })
    }
  }, [keyPoints, view])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  const onMouseLeave = useCallback(() => {
    dragRef.current = null
    setTooltip({ visible: false })
  }, [])

  const addEquation = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const normalized = /^[yY]\s*=/.test(trimmed) ? trimmed : `y=${trimmed}`
    setEquations(prev => [...prev, normalized])
    setInput('')
  }

  const removeEquation = idx => setEquations(prev => prev.filter((_, i) => i !== idx))
  const resetView = () => {
    if (!equations.length) return
    const { xMin, xMax } = getDefaultXBounds(equations[0])
    setView(getGraphBounds(x => evalAt(equations[0], x), xMin, xMax))
  }

  // Tooltip horizontal flip: if near right edge, show to the left of cursor
  const tooltipLeft = tooltip.visible
    ? (tooltip.pixelX > (tooltip.containerWidth ?? 0) * 0.65
        ? tooltip.pixelX - 12 - 150
        : tooltip.pixelX + 12)
    : 0
  const tooltipTop = tooltip.visible ? Math.max(tooltip.dotY - 28, 4) : 0

  return (
    <div style={{ margin: '14px 0', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {(titleHtml || title) && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #E5E7EB', fontSize: 13, fontWeight: 600, color: '#1E3A8A' }}>
          {titleHtml
            ? <span dangerouslySetInnerHTML={{ __html: titleHtml }} />
            : title}
        </div>
      )}

      {/* Canvas + overlay wrapper */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: canvasHeight, display: 'block', cursor: tooltip.visible ? 'pointer' : 'default', background: '#fff' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />

        {/* Fix 3 — crosshair dot snapped to the curve */}
        {tooltip.visible && (
          <div style={{
            position: 'absolute',
            left: tooltip.pixelX - 5,
            top: tooltip.dotY - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: tooltip.color,
            border: '2px solid #fff',
            boxShadow: `0 0 0 1.5px ${tooltip.color}`,
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}

        {/* Fix 2 — coordinate tooltip */}
        {tooltip.visible && (
          <div style={{
            position: 'absolute',
            left: tooltipLeft,
            top: tooltipTop,
            background: '#1f2937',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            lineHeight: 1.5,
          }}>
            {tooltip.label}
          </div>
        )}
      </div>

      {!compact && <div style={{ borderTop: '1px solid #E5E7EB', padding: '10px 14px', background: '#FAFAFA' }}>
        {equations.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginBottom: 8 }}>
            {equations.map((eq, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 8px 3px 6px', fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span style={{ color: '#374151' }}>{eq}</span>
                <button onClick={() => removeEquation(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEquation()}
            placeholder="y=x^2+2x-3"
            style={{ flex: 1, border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 10px', fontSize: 13, outline: 'none', color: '#1F2937' }}
          />
          <button onClick={addEquation} style={{ background: '#4F7EFF', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>추가</button>
          <button onClick={resetView} style={{ background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>리셋</button>
        </div>
      </div>}
    </div>
  )
}
