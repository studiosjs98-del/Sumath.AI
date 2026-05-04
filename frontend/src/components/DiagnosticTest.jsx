import React, { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle, XCircle, ChevronRight, Star, BookOpen } from 'lucide-react'
import api from '../utils/api'
import { MathBlock, MathText } from './MathRenderer'
import useStore from '../store/useStore'

/* ─── Constants ────────────────────────────────────────────── */
const TOTAL_Q = 15
const Q_TIME = 80            // seconds per question
const CIRC = 2 * Math.PI * 36  // circumference for r=36 circle

/* ─── Grade helpers ────────────────────────────────────────── */
const GRADE_META = {
  1: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: '1등급', msg: '완벽해요! 최상위 수학 실력입니다' },
  2: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: '2등급', msg: '훌륭해요! 조금만 더 하면 1등급이에요' },
  3: { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: '3등급', msg: '잘 하고 있어요! 2등급이 눈앞이에요' },
  4: { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', label: '4등급', msg: '좋아요! 꾸준히 하면 3등급 달성 가능해요' },
  5: { color: '#4f46e5', bg: '#eef2ff', border: '#a5b4fc', label: '5등급', msg: '노력 중이에요. 취약 단원을 집중 공략해봐요' },
  6: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: '6등급', msg: '기초를 다지면 금방 올라갈 수 있어요' },
  7: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: '7등급', msg: '차근차근 기초부터 시작해봐요' },
  8: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: '8등급', msg: '지금부터 시작이에요! 기초 단원부터 공략해봐요' },
  9: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: '9등급', msg: '괜찮아요! 차근차근 쌓아가봐요' },
}

const GRADE_PERCENTILES = [4, 11, 23, 40, 60, 77, 89, 96, 100]

function calcGrade(weightedPct) {
  if (weightedPct >= 90) return 1
  if (weightedPct >= 78) return 2
  if (weightedPct >= 62) return 3
  if (weightedPct >= 48) return 4
  if (weightedPct >= 35) return 5
  if (weightedPct >= 24) return 6
  if (weightedPct >= 14) return 7
  if (weightedPct >= 6)  return 8
  return 9
}

/* ─── Topic → radar axis ───────────────────────────────────── */
const AXIS_LABELS = ['수와\n연산', '방정식\n대수', '기하\n측정', '함수\n그래프', '통계\n확률']

function topicAxis(topic = '', curriculum = '') {
  const t = `${topic} ${curriculum}`.toLowerCase()
  if (/수|연산|분수|소수|정수|유리|무리|자연/.test(t)) return 0
  if (/방정식|부등식|다항|인수|대수|단항|이항|이차식/.test(t)) return 1
  if (/도형|각|넓이|원|삼각|사각|기하|피타고라스|측정|부피/.test(t)) return 2
  if (/함수|그래프|비례|이차함수|일차함수|포물|좌표/.test(t)) return 3
  if (/통계|확률|경우|조합|순열|도수|상대/.test(t)) return 4
  return (topic.charCodeAt(0) || 0) % 5
}

/* ─── Particle burst ────────────────────────────────────────── */
function triggerParticles() {
  const colors = ['#3b82f6','#7c3aed','#10b981','#f59e0b','#ef4444','#60a5fa','#a78bfa','#fff']
  for (let i = 0; i < 70; i++) {
    const el = document.createElement('div')
    const angle = (i / 70) * 360
    const dist = 80 + Math.random() * 220
    const tx = Math.cos(angle * Math.PI / 180) * dist
    const ty = Math.sin(angle * Math.PI / 180) * dist
    const size = 4 + Math.random() * 8
    el.style.cssText = `
      position:fixed;left:50%;top:50%;
      width:${size}px;height:${size}px;
      border-radius:${Math.random() > 0.4 ? '50%' : '3px'};
      background:${colors[i % colors.length]};
      pointer-events:none;z-index:10001;
      --tx:${tx}px;--ty:${ty}px;
      animation:diagPart 1.4s cubic-bezier(0,0.85,0.25,1) ${i * 9}ms forwards;
    `
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1500 + i * 9)
  }
}

/* ─── Radar chart ───────────────────────────────────────────── */
function RadarChart({ scores = [50,50,50,50,50] }) {
  const CX = 110, CY = 110, R = 72
  const angles = [0,1,2,3,4].map(i => ((i * 72) - 90) * Math.PI / 180)

  const gridPts = (frac) =>
    angles.map(a => `${CX + R * frac * Math.cos(a)},${CY + R * frac * Math.sin(a)}`).join(' ')

  const scorePts = angles.map((a, i) => {
    const r = R * Math.max(0.05, (scores[i] || 0) / 100)
    return `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`
  }).join(' ')

  const labelPos = angles.map(a => ({
    x: CX + (R + 26) * Math.cos(a),
    y: CY + (R + 26) * Math.sin(a),
  }))

  return (
    <svg width="220" height="220" viewBox="0 0 220 220">
      {[0.25,0.5,0.75,1].map((f,i) => (
        <polygon key={i} points={gridPts(f)} fill="none" stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={CX} y1={CY}
          x2={CX + R * Math.cos(a)} y2={CY + R * Math.sin(a)}
          stroke="#e5e7eb" strokeWidth="1" />
      ))}
      <polygon points={scorePts}
        fill="rgba(37,99,235,0.18)" stroke="#2563eb" strokeWidth="2.5"
        style={{ animation: 'radarGrow 0.9s cubic-bezier(0.34,1.56,0.64,1) 0.5s both', transformOrigin: `${CX}px ${CY}px` }}
      />
      {angles.map((a, i) => {
        const r = R * Math.max(0.05, (scores[i] || 0) / 100)
        return <circle key={i} cx={CX + r * Math.cos(a)} cy={CY + r * Math.sin(a)} r="5"
          fill="#2563eb"
          style={{ animation: `radarGrow 0.9s cubic-bezier(0.34,1.56,0.64,1) ${0.5 + i * 0.06}s both`, transformOrigin: `${CX}px ${CY}px` }}
        />
      })}
      {AXIS_LABELS.map((lbl, i) => (
        <text key={i} x={labelPos[i].x} y={labelPos[i].y}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fontWeight="700" fill="#4b5563"
          fontFamily="'Noto Sans KR', sans-serif"
        >
          {lbl.split('\n').map((line, j) => (
            <tspan key={j} x={labelPos[i].x} dy={j === 0 ? (lbl.includes('\n') ? -6 : 0) : 12}>{line}</tspan>
          ))}
        </text>
      ))}
      {/* Score % labels on dots */}
      {angles.map((a, i) => {
        const r = R * Math.max(0.05, (scores[i] || 0) / 100)
        return (
          <text key={`s${i}`}
            x={CX + r * Math.cos(a) + (Math.cos(a) > 0 ? 10 : -10)}
            y={CY + r * Math.sin(a) + (Math.sin(a) > 0 ? 10 : -10)}
            fontSize="9" fontWeight="800" fill="#2563eb" textAnchor="middle"
            style={{ animation: `radarGrow 0.6s ease ${0.8 + i * 0.06}s both`, transformOrigin: `${CX}px ${CY}px` }}
          >
            {scores[i]}%
          </text>
        )
      })}
    </svg>
  )
}

/* ─── Circular timer ────────────────────────────────────────── */
function CircularTimer({ timeLeft, total = Q_TIME }) {
  const pct = timeLeft / total
  const offset = CIRC * (1 - pct)
  const danger = timeLeft <= 15
  const warn = timeLeft <= 30

  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="36" fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle cx="45" cy="45" r="36"
        fill="none"
        stroke={danger ? '#dc2626' : warn ? '#d97706' : '#2563eb'}
        strokeWidth="6"
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s' }}
      />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="central"
        fontSize={timeLeft >= 10 ? '22' : '20'}
        fontWeight="900"
        fill={danger ? '#dc2626' : '#111827'}
        fontFamily="'Noto Sans KR', sans-serif"
      >
        {timeLeft}
      </text>
    </svg>
  )
}

/* ─── Main component ────────────────────────────────────────── */
export default function DiagnosticTest({ onClose }) {
  const { student, updateStudent } = useStore()

  // ── Phase ──────────────────────────────────────────────────
  const [phase, setPhase] = useState('intro')  // intro | test | results

  // ── Intro animation ────────────────────────────────────────
  const [showCard, setShowCard] = useState(false)
  const [titleText, setTitleText] = useState('')
  const [showSubtitle, setShowSubtitle] = useState(false)
  const [showBtns, setShowBtns] = useState(false)

  // ── Problems pool ──────────────────────────────────────────
  const [poolByDiff, setPoolByDiff] = useState({})
  const [poolReady, setPoolReady] = useState(false)

  // ── Test state ─────────────────────────────────────────────
  const [questionSeq, setQuestionSeq] = useState([])  // chosen questions in order
  const [currentIdx, setCurrentIdx] = useState(0)
  const [currentDiff, setCurrentDiff] = useState(2)
  const [usedIds, setUsedIds] = useState(new Set())
  const [selectedOpt, setSelectedOpt] = useState(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [timeLeft, setTimeLeft] = useState(Q_TIME)
  const [slideKey, setSlideKey] = useState(0)

  // ── Results ────────────────────────────────────────────────
  const [gradeNum, setGradeNum] = useState(null)
  const [radarScores, setRadarScores] = useState([50,50,50,50,50])
  const [gaugeTarget, setGaugeTarget] = useState(0)
  const [gaugeValue, setGaugeValue] = useState(0)
  const [weakTopics, setWeakTopics] = useState([])
  const [showGradeBadge, setShowGradeBadge] = useState(false)
  const [resultDone, setResultDone] = useState(false)

  // ── Refs ───────────────────────────────────────────────────
  const resultsRef = useRef([])
  const usedIdsRef = useRef(new Set())
  const poolRef = useRef({})
  const currentDiffRef = useRef(2)
  const qStartRef = useRef(Date.now())
  const timerRef = useRef(null)
  const feedbackRef = useRef(false)

  /* ── Load problems ────────────────────────────────────────── */
  useEffect(() => {
    api.get('/diagnostic/questions', { params: { grade: student?.grade_level || '중3' } })
      .then(r => {
        const problems = r.data.problems || []
        const byDiff = {}
        for (const p of problems) {
          const d = Math.max(1, Math.min(5, p.difficulty || 2))
          if (!byDiff[d]) byDiff[d] = []
          byDiff[d].push(p)
        }
        poolRef.current = byDiff
        setPoolByDiff(byDiff)
        setPoolReady(problems.length > 0)
      })
      .catch(console.error)
  }, [student?.grade_level])

  /* ── Intro animation sequence ─────────────────────────────── */
  useEffect(() => {
    if (phase !== 'intro') return
    triggerParticles()
    const t1 = setTimeout(() => setShowCard(true), 60)
    return () => clearTimeout(t1)
  }, [phase])

  useEffect(() => {
    if (!showCard || phase !== 'intro') return
    const TITLE = '수학 실력 진단'
    let i = 0
    const t1 = setTimeout(() => {
      const iv = setInterval(() => {
        i++
        setTitleText(TITLE.slice(0, i))
        if (i >= TITLE.length) {
          clearInterval(iv)
          setTimeout(() => setShowSubtitle(true), 280)
          setTimeout(() => setShowBtns(true), 700)
        }
      }, 85)
    }, 680)
    return () => clearTimeout(t1)
  }, [showCard])

  /* ── Timer ────────────────────────────────────────────────── */
  // Simple tick-based timer — pauses when feedback is shown
  useEffect(() => {
    if (phase !== 'test' || feedbackRef.current || timeLeft <= 0) return
    const id = setTimeout(() => setTimeLeft(v => v - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, timeLeft])

  // Auto-expire on 0
  useEffect(() => {
    if (phase !== 'test' || timeLeft !== 0 || feedbackRef.current) return
    feedbackRef.current = true
    setShowFeedback(true)
    const cur = questionSeq[currentIdx]
    if (cur) {
      const newR = [...resultsRef.current, {
        problem: cur, selectedIdx: null, correct: false,
        difficulty: cur.difficulty || 1, timeSpent: Q_TIME
      }]
      resultsRef.current = newR
      setSelectedOpt(null)
    }
    setTimeout(() => advance(false), 900)
  }, [timeLeft, phase])

  /* ── Helpers ──────────────────────────────────────────────── */
  function pickProblem(diff, used) {
    const pool = poolRef.current
    for (const d of [diff, diff+1, diff-1, diff+2, diff-2]) {
      if (d < 1 || d > 5) continue
      const candidates = (pool[d] || []).filter(p => !used.has(p.id))
      if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)]
    }
    return Object.values(pool).flat().find(p => !used.has(p.id)) || null
  }

  const startTest = useCallback(() => {
    if (!poolReady) return
    // Pick first question at difficulty 2
    const firstP = pickProblem(2, new Set())
    if (!firstP) { onClose(); return }
    const used = new Set([firstP.id])
    usedIdsRef.current = used
    setUsedIds(new Set(used))
    setQuestionSeq([firstP])
    setCurrentIdx(0)
    currentDiffRef.current = 2
    setCurrentDiff(2)
    resultsRef.current = []
    setSelectedOpt(null)
    feedbackRef.current = false
    setShowFeedback(false)
    setTimeLeft(Q_TIME)
    setSlideKey(0)
    qStartRef.current = Date.now()
    setPhase('test')
  }, [poolReady, onClose])

  const advance = useCallback((wasCorrect) => {
    const newDiff = wasCorrect
      ? Math.min(5, currentDiffRef.current + 1)
      : Math.max(1, currentDiffRef.current - 1)
    currentDiffRef.current = newDiff
    setCurrentDiff(newDiff)

    const nextIdx = currentIdx + 1
    const doneNow = nextIdx >= TOTAL_Q

    if (!doneNow) {
      // Pick next problem adaptively
      const nextP = pickProblem(newDiff, usedIdsRef.current)
      if (nextP) {
        usedIdsRef.current.add(nextP.id)
        setUsedIds(new Set(usedIdsRef.current))
        setQuestionSeq(prev => [...prev, nextP])
      }
      setCurrentIdx(nextIdx)
      setSelectedOpt(null)
      feedbackRef.current = false
      setShowFeedback(false)
      setTimeLeft(Q_TIME)
      setSlideKey(k => k + 1)
      qStartRef.current = Date.now()
    } else {
      computeResults()
    }
  }, [currentIdx])

  const handleAnswer = useCallback((optIdx) => {
    if (feedbackRef.current || selectedOpt !== null) return
    const cur = questionSeq[currentIdx]
    if (!cur) return
    clearTimeout(timerRef.current)

    const correct = optIdx === cur.correct_option_index
    const elapsed = Math.round((Date.now() - qStartRef.current) / 1000)
    feedbackRef.current = true
    setShowFeedback(true)
    setSelectedOpt(optIdx)

    const newR = [...resultsRef.current, {
      problem: cur, selectedIdx: optIdx, correct,
      difficulty: cur.difficulty || 1, timeSpent: elapsed
    }]
    resultsRef.current = newR

    setTimeout(() => advance(correct), 900)
  }, [questionSeq, currentIdx, selectedOpt, advance])

  function computeResults() {
    const all = resultsRef.current
    let totalW = 0, correctW = 0
    const axisC = [0,0,0,0,0], axisT = [0,0,0,0,0]
    const topicAcc = {}

    for (const r of all) {
      const w = r.difficulty
      totalW += w
      if (r.correct) correctW += w
      const ax = topicAxis(r.problem.topic, r.problem.curriculum)
      axisT[ax]++
      if (r.correct) axisC[ax]++
      // track per topic
      const tk = r.problem.topic || '기타'
      if (!topicAcc[tk]) topicAcc[tk] = { correct: 0, total: 0 }
      topicAcc[tk].total++
      if (r.correct) topicAcc[tk].correct++
    }

    const pct = totalW > 0 ? Math.round((correctW / totalW) * 100) : 0
    const g = calcGrade(pct)
    const radar = axisT.map((t, i) => t > 0 ? Math.round((axisC[i] / t) * 100) : 50)

    const weakT = Object.entries(topicAcc)
      .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.5)
      .map(([topic]) => topic)
      .slice(0, 3)

    setGradeNum(g)
    setRadarScores(radar)
    setWeakTopics(weakT)
    const perc = GRADE_PERCENTILES[g - 1]
    setGaugeTarget(perc)
    setPhase('results')

    setTimeout(() => setShowGradeBadge(true), 300)
    setTimeout(() => {
      let v = 0
      const step = perc / 60
      const iv = setInterval(() => {
        v = Math.min(perc, v + step)
        setGaugeValue(Math.round(v))
        if (v >= perc) clearInterval(iv)
      }, 16)
    }, 900)

    // Save to backend
    api.post('/diagnostic/result', { grade: g, percentile: perc })
      .then(r => { if (r.data.student) updateStudent(r.data.student) })
      .catch(() => {})

    setTimeout(() => setResultDone(true), 1800)
  }

  /* ── RENDER: Intro ────────────────────────────────────────── */
  const gMeta = gradeNum ? GRADE_META[gradeNum] : null
  const currentProblem = questionSeq[currentIdx]

  if (phase === 'intro' || (phase !== 'test' && phase !== 'results')) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'diagOverlay 0.35s ease forwards'
      }}>
        {showCard && (
          <div style={{
            background: '#fff', borderRadius: 28, padding: '44px 40px',
            maxWidth: 520, width: '100%',
            boxShadow: '0 0 0 2px rgba(59,130,246,0.3)',
            animation: 'diagCard 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards, glowPulse 2.5s ease 0.8s infinite',
            textAlign: 'center'
          }}>
            {/* Stars deco */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[0.6, 1, 0.6].map((op, i) => (
                <Star key={i} size={i === 1 ? 20 : 14} color="#f59e0b"
                  fill="#f59e0b" strokeWidth={0} style={{ opacity: op }} />
              ))}
            </div>

            {/* Typewriter title */}
            <h1 style={{
              fontSize: 36, fontWeight: 900, color: '#111827',
              letterSpacing: -1, marginBottom: 12, minHeight: 44,
            }}>
              {titleText}
              <span style={{ animation: 'blink 0.8s step-end infinite', color: '#2563eb' }}>|</span>
            </h1>

            {/* Subtitle */}
            {showSubtitle && (
              <p style={{
                fontSize: 15, color: '#6b7280', lineHeight: 1.7, marginBottom: 32,
                animation: 'diagFadeUp 0.5s ease forwards'
              }}>
                20분으로 나의 수학 실력을 정확히 파악해보세요<br />
                <span style={{ fontSize: 13, color: '#9ca3af' }}>
                  15문제 · {student?.grade_level || ''} 수준 · 맞춤형 적응 테스트
                </span>
              </p>
            )}

            {/* Grade preview badges */}
            {showSubtitle && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap', animation: 'diagFadeUp 0.5s ease 0.1s both' }}>
                {[1,2,3,4,5].map(g => {
                  const m = GRADE_META[g]
                  return (
                    <span key={g} style={{ fontSize: 12, fontWeight: 700, background: m.bg, color: m.color, border: `1px solid ${m.border}`, borderRadius: 20, padding: '3px 10px' }}>
                      {m.label}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Buttons */}
            {showBtns && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'diagFadeUp 0.45s ease forwards' }}>
                <button
                  onClick={startTest}
                  disabled={!poolReady}
                  style={{
                    height: 54, borderRadius: 14, fontWeight: 900, fontSize: 17,
                    background: poolReady ? 'linear-gradient(135deg, #1e40af, #4f46e5)' : '#e5e7eb',
                    color: poolReady ? '#fff' : '#9ca3af',
                    border: 'none', cursor: poolReady ? 'pointer' : 'not-allowed',
                    boxShadow: poolReady ? '0 6px 20px rgba(30,64,175,0.4)' : 'none',
                    animation: 'btnGlow 2s ease 0.3s infinite',
                    transition: 'transform 0.15s'
                  }}
                  onMouseEnter={e => { if (poolReady) e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => e.currentTarget.style.transform = ''}
                >
                  {poolReady ? '진단 시작하기' : '문제 불러오는 중...'}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    height: 44, borderRadius: 12, fontWeight: 600, fontSize: 14,
                    background: 'transparent', color: '#9ca3af',
                    border: '1.5px solid #e5e7eb', cursor: 'pointer'
                  }}
                >
                  나중에 하기
                </button>
              </div>
            )}
          </div>
        )}
        <Styles />
      </div>
    )
  }

  /* ── RENDER: Test ─────────────────────────────────────────── */
  if (phase === 'test') {
    if (!currentProblem) return null
    const options = currentProblem.mc_options || []
    const LABELS = ['A', 'B', 'C', 'D']

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: '#0f172a',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px',
          background: '#1e293b', borderBottom: '1px solid #334155'
        }}>
          {/* Progress */}
          <div style={{ flex: 1, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>수학 실력 진단</span>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{currentIdx + 1} / {TOTAL_Q}</span>
            </div>
            <div style={{ height: 5, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                width: `${((currentIdx + (showFeedback ? 1 : 0)) / TOTAL_Q) * 100}%`,
                transition: 'width 0.5s ease'
              }} />
            </div>
          </div>

          {/* Difficulty indicator */}
          <div style={{
            margin: '0 20px',
            padding: '4px 12px', borderRadius: 20,
            background: '#334155', fontSize: 12, fontWeight: 700, color: '#94a3b8'
          }}>
            난이도 {currentDiff}
          </div>

          {/* Timer */}
          <CircularTimer timeLeft={timeLeft} />
        </div>

        {/* Question area */}
        <div style={{
          flex: 1, overflow: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '28px 24px', gap: 20
        }}>
          {/* Question card */}
          <div
            key={slideKey}
            style={{
              background: '#1e293b', borderRadius: 20, padding: '32px',
              maxWidth: 680, width: '100%',
              border: '1px solid #334155',
              animation: 'qSlideIn 0.35s cubic-bezier(0.34,1.2,0.64,1) forwards',
              fontSize: 19, lineHeight: 1.85, color: '#e2e8f0'
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 700, letterSpacing: 0.5 }}>
              {currentProblem.grade} · {currentProblem.topic}
            </div>
            <MathText text={currentProblem.question_latex} />
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680, width: '100%' }}>
            {options.map((opt, i) => {
              const isSelected = selectedOpt === i
              const correct = currentProblem.correct_option_index
              let borderC = '#334155', bgC = '#1e293b', textC = '#e2e8f0'

              if (showFeedback) {
                if (i === correct) { borderC = '#059669'; bgC = '#064e3b'; }
                else if (isSelected) { borderC = '#dc2626'; bgC = '#450a0a'; }
                else { textC = '#475569' }
              } else if (isSelected) {
                borderC = '#3b82f6'; bgC = '#1d4ed8'
              }

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 20px', borderRadius: 14,
                    border: `2px solid ${borderC}`,
                    background: bgC, color: textC,
                    cursor: showFeedback ? 'default' : 'pointer',
                    textAlign: 'left', transition: 'all 0.2s',
                    animation: `qSlideIn 0.35s cubic-bezier(0.34,1.2,0.64,1) ${0.04 + i * 0.04}s both`
                  }}
                  onMouseEnter={e => { if (!showFeedback) e.currentTarget.style.borderColor = '#3b82f6' }}
                  onMouseLeave={e => { if (!showFeedback && !isSelected) e.currentTarget.style.borderColor = '#334155' }}
                >
                  <span style={{
                    minWidth: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: showFeedback
                      ? (i === correct ? '#059669' : isSelected ? '#dc2626' : '#334155')
                      : (isSelected ? '#3b82f6' : '#334155'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff'
                  }}>
                    {showFeedback && i === correct
                      ? <CheckCircle size={16} strokeWidth={2.5} />
                      : showFeedback && isSelected && i !== correct
                        ? <XCircle size={16} strokeWidth={2.5} />
                        : LABELS[i]}
                  </span>
                  <span style={{ fontSize: 16, lineHeight: 1.55 }}><MathText text={opt} /></span>
                </button>
              )
            })}
          </div>
        </div>
        <Styles />
      </div>
    )
  }

  /* ── RENDER: Results ─────────────────────────────────────── */
  if (phase === 'results' && gMeta) {
    const perc = GRADE_PERCENTILES[gradeNum - 1]
    const totalCorrect = resultsRef.current.filter(r => r.correct).length

    // Gauge arc (semicircle): 180 degrees
    const GCIRC = Math.PI * 60  // half circle r=60
    const gaugeFill = (gaugeValue / 100) * GCIRC

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        overflow: 'auto',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 20px',
        animation: 'diagOverlay 0.3s ease forwards'
      }}>
        <div style={{
          background: '#fff', borderRadius: 28, padding: '40px 36px',
          maxWidth: 600, width: '100%',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
          animation: 'diagCard 0.5s cubic-bezier(0.34,1.4,0.64,1) forwards'
        }}>
          {/* Grade badge */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            {showGradeBadge && (
              <div style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                gap: 8,
                animation: 'gradeBounce 0.7s cubic-bezier(0.34,1.7,0.64,1) forwards'
              }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${gMeta.bg}, #fff)`,
                  border: `4px solid ${gMeta.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 8px 32px ${gMeta.color}40`,
                }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: gMeta.color, lineHeight: 1 }}>
                    {gradeNum}
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: gMeta.color }}>{gMeta.label}</div>
              </div>
            )}

            <p style={{ fontSize: 16, color: '#374151', marginTop: 12, fontWeight: 600 }}>{gMeta.msg}</p>

            {/* Accuracy */}
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>
                  {totalCorrect} / {TOTAL_Q}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>정답</div>
              </div>
              <div style={{ width: 1, background: '#e5e7eb' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: gMeta.color }}>
                  상위 {perc}%
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>예상 백분위</div>
              </div>
            </div>
          </div>

          {/* Percentile gauge */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <svg width="200" height="110" viewBox="0 0 200 110">
              {/* Background arc */}
              <path d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round" />
              {/* Filled arc */}
              <path d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none" stroke={gMeta.color} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={GCIRC}
                strokeDashoffset={GCIRC - (gaugeValue / 100) * GCIRC}
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
              <text x="100" y="90" textAnchor="middle" fontSize="22" fontWeight="900" fill={gMeta.color}>
                {gaugeValue}%
              </text>
              <text x="100" y="108" textAnchor="middle" fontSize="10" fill="#9ca3af">전국 상위 백분위</text>
            </svg>
          </div>

          {/* Radar chart */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <BookOpen size={14} color="#6b7280" strokeWidth={1.75} /> 영역별 실력 분석
            </h3>
            <RadarChart scores={radarScores} />
          </div>

          {/* Weak topics */}
          {weakTopics.length > 0 && (
            <div style={{ background: '#fef2f2', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <XCircle size={14} color="#dc2626" strokeWidth={2} /> 집중 학습 필요
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {weakTopics.map(t => (
                  <span key={t} style={{ fontSize: 12, background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          {resultDone && (
            <div style={{ display: 'flex', gap: 10, animation: 'diagFadeUp 0.4s ease forwards' }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, height: 52, borderRadius: 14, fontWeight: 900, fontSize: 16,
                  background: 'linear-gradient(135deg, #1e40af, #4f46e5)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(30,64,175,0.35)'
                }}
              >
                맞춤 학습 시작하기 →
              </button>
            </div>
          )}
        </div>
        <Styles />
      </div>
    )
  }

  return null
}

/* ─── All keyframes in one place ───────────────────────────── */
function Styles() {
  return (
    <style>{`
      @keyframes diagOverlay { from { opacity:0 } to { opacity:1 } }
      @keyframes diagCard {
        0%   { opacity:0; transform:translateY(100px) scale(0.92) }
        65%  { transform:translateY(-8px) scale(1.01) }
        82%  { transform:translateY(4px) scale(0.995) }
        100% { opacity:1; transform:translateY(0) scale(1) }
      }
      @keyframes glowPulse {
        0%,100% { box-shadow: 0 0 0 2px rgba(59,130,246,0.3), 0 0 30px rgba(59,130,246,0.12), 0 24px 80px rgba(0,0,0,0.35) }
        50%     { box-shadow: 0 0 0 3px rgba(59,130,246,0.6), 0 0 60px rgba(59,130,246,0.28), 0 24px 80px rgba(0,0,0,0.35) }
      }
      @keyframes diagFadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
      @keyframes diagPart {
        0%   { transform:translate(-50%,-50%) scale(0); opacity:1 }
        100% { transform:translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1); opacity:0 }
      }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes btnGlow {
        0%,100% { box-shadow: 0 6px 20px rgba(30,64,175,0.35) }
        50%     { box-shadow: 0 6px 32px rgba(30,64,175,0.65), 0 0 0 4px rgba(79,70,229,0.15) }
      }
      @keyframes qSlideIn { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
      @keyframes gradeBounce {
        0%   { opacity:0; transform:scale(0) }
        65%  { transform:scale(1.18) }
        82%  { transform:scale(0.94) }
        100% { opacity:1; transform:scale(1) }
      }
      @keyframes radarGrow { from { opacity:0; transform:scale(0) } to { opacity:1; transform:scale(1) } }
    `}</style>
  )
}
