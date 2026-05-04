import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Clock, ChevronRight, ChevronLeft, CheckCircle, XCircle, AlertTriangle, BookOpen, GraduationCap } from 'lucide-react'
import api from '../utils/api'
import { MathBlock, MathText } from '../components/MathRenderer'

// ─── constants ────────────────────────────────────────────────────────────────
const SUNEUNG_DATE = new Date('2026-11-12T08:40:00')
const TOTAL_SECONDS = 100 * 60   // 100 minutes
const TOTAL_QUESTIONS = 30

// Q1-20: MC (①②③④), Q21-30: 단답형
const isMC = (idx) => idx < 20
const OPTION_LABELS = ['①', '②', '③', '④']

// Point weights
const pointsFor = (idx) => {
  if (idx >= 28) return 8   // Q29-30: 8점
  if (idx >= 20) return 4   // Q21-28: 4점
  return 2.5                // Q1-20: 2.5점
}

function getGrade(score) {
  if (score >= 88) return { grade: 1, percentile: 4, color: '#dc2626' }
  if (score >= 75) return { grade: 2, percentile: 11, color: '#d97706' }
  if (score >= 60) return { grade: 3, percentile: 23, color: '#d97706' }
  if (score >= 45) return { grade: 4, percentile: 40, color: '#2563eb' }
  if (score >= 32) return { grade: 5, percentile: 60, color: '#2563eb' }
  if (score >= 22) return { grade: 6, percentile: 77, color: '#6b7280' }
  if (score >= 12) return { grade: 7, percentile: 89, color: '#6b7280' }
  if (score >= 4)  return { grade: 8, percentile: 96, color: '#6b7280' }
  return { grade: 9, percentile: 100, color: '#6b7280' }
}

function getDday() {
  const now = new Date()
  const diff = SUNEUNG_DATE - now
  if (diff <= 0) return 'D-Day'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  return `D-${days}`
}

function stripLatex(s = '') {
  return s.replace(/\\[a-zA-Z]+\{?|\}|\\|[$\s]/g, '').trim()
}

// ─── main component ───────────────────────────────────────────────────────────
export default function SuneungPage() {
  const [phase, setPhase] = useState('landing')  // landing | track | test | results
  const [track, setTrack] = useState(null)
  const [problems, setProblems] = useState([])
  const [loadingProblems, setLoadingProblems] = useState(false)

  // test state
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState(Array(TOTAL_QUESTIONS).fill(null))
  const [shortInputs, setShortInputs] = useState(Array(TOTAL_QUESTIONS).fill(''))
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS)
  const [timerActive, setTimerActive] = useState(false)
  const [questionTimes, setQuestionTimes] = useState(Array(TOTAL_QUESTIONS).fill(0))
  const qStartRef = useRef(Date.now())
  const timerRef = useRef(null)
  const [dday, setDday] = useState(getDday())

  useEffect(() => {
    const t = setInterval(() => setDday(getDday()), 60000)
    return () => clearInterval(t)
  }, [])

  // Timer logic
  useEffect(() => {
    if (!timerActive) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          setTimerActive(false)
          submitTest()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timerActive])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const loadProblems = async (selectedTrack) => {
    setLoadingProblems(true)
    try {
      // Fetch highest-difficulty problems
      const res = await api.get('/problems', { params: { grade: selectedTrack === '가형' ? '고3' : '고2' } })
      let pool = (res.data.problems || []).sort((a, b) => b.difficulty - a.difficulty)
      if (pool.length < TOTAL_QUESTIONS) {
        const extra = await api.get('/problems')
        const all = extra.data.problems || []
        const existing = new Set(pool.map(p => p.id))
        const more = all.filter(p => !existing.has(p.id)).sort((a, b) => b.difficulty - a.difficulty)
        pool = [...pool, ...more]
      }
      setProblems(pool.slice(0, TOTAL_QUESTIONS))
    } catch { setProblems([]) }
    finally { setLoadingProblems(false) }
  }

  const startTest = () => {
    setPhase('test')
    setCurrentQ(0)
    setAnswers(Array(TOTAL_QUESTIONS).fill(null))
    setShortInputs(Array(TOTAL_QUESTIONS).fill(''))
    setTimeLeft(TOTAL_SECONDS)
    setTimerActive(true)
    qStartRef.current = Date.now()
    setQuestionTimes(Array(TOTAL_QUESTIONS).fill(0))
  }

  const recordQuestionTime = useCallback((from, to) => {
    const elapsed = Math.round((Date.now() - qStartRef.current) / 1000)
    setQuestionTimes(prev => {
      const next = [...prev]
      next[from] = (next[from] || 0) + elapsed
      return next
    })
    qStartRef.current = Date.now()
  }, [])

  const goTo = (next) => {
    recordQuestionTime(currentQ, next)
    setCurrentQ(next)
  }

  const submitTest = useCallback(() => {
    clearInterval(timerRef.current)
    setTimerActive(false)
    recordQuestionTime(currentQ, -1)
    setPhase('results')
  }, [currentQ, recordQuestionTime])

  // ─── RESULTS calculation ──────────────────────────────────────────────────
  const computeResults = () => {
    let score = 0
    const detail = problems.map((p, i) => {
      const pts = pointsFor(i)
      let correct = false
      if (isMC(i)) {
        correct = answers[i] === p.correct_option_index
      } else {
        const expected = stripLatex(p.answer_latex)
        correct = shortInputs[i].trim() === expected
      }
      if (correct) score += pts
      return { problem: p, correct, pts, userAnswer: isMC(i) ? answers[i] : shortInputs[i], timeSpent: questionTimes[i] || 0 }
    })
    return { score: Math.round(score), detail, gradeInfo: getGrade(Math.round(score)) }
  }

  // ─── LANDING ──────────────────────────────────────────────────────────────
  if (phase === 'landing') return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#fff' }}>
      {/* D-day banner */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 2 }}>
          2026학년도 수능 · <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: 15 }}>{dday}</span>
        </span>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 24, padding: '6px 16px', fontSize: 12, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 24, textTransform: 'uppercase' }}>
            <GraduationCap size={14} color="#fbbf24" strokeWidth={2} /> 수능 대비 전용
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 20 }}>
            수능 수학,
            <br />
            <span style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              완벽하게 준비하세요
            </span>
          </h1>
          <p style={{ fontSize: 17, color: '#94a3b8', lineHeight: 1.8, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
            실제 수능과 동일한 형식으로 30문제 100분 모의고사.
            <br />AI가 틀린 문제를 분석하고 맞춤 설명을 제공합니다.
          </p>
          <button
            className="btn"
            onClick={() => setPhase('track')}
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#1e293b', fontWeight: 900, fontSize: 17,
              height: 56, padding: '0 36px', borderRadius: 12,
              boxShadow: '0 8px 32px rgba(251,191,36,0.35)'
            }}
          >
            모의고사 시작 <ChevronRight size={18} strokeWidth={2.5} style={{ display: 'inline' }} />
          </button>
        </div>

        {/* Info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 48 }}>
          {[
            { num: '30', unit: '문제', desc: '1~20번 객관식 + 21~30번 단답형' },
            { num: '100', unit: '분', desc: '실제 수능과 동일한 시험 시간' },
            { num: '100', unit: '점', desc: '원점수 및 1~9등급 표시' },
          ].map(({ num, unit, desc }) => (
            <div key={num+unit} style={{ background: '#1e293b', borderRadius: 16, padding: '24px 20px', border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>{num}<span style={{ fontSize: 20 }}>{unit}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Score guide */}
        <div style={{ background: '#1e293b', borderRadius: 16, padding: '28px', border: '1px solid #334155' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>등급 기준 (원점수 기준)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
            {[
              { g: 1, score: '88점+', color: '#dc2626' },
              { g: 2, score: '75~87', color: '#d97706' },
              { g: 3, score: '60~74', color: '#d97706' },
              { g: 4, score: '45~59', color: '#2563eb' },
              { g: 5, score: '32~44', color: '#2563eb' },
              { g: 6, score: '22~31', color: '#6b7280' },
              { g: 7, score: '12~21', color: '#6b7280' },
              { g: 8, score: '4~11',  color: '#6b7280' },
              { g: 9, score: '0~3',   color: '#6b7280' },
            ].map(({ g, score, color }) => (
              <div key={g} style={{ textAlign: 'center', padding: '10px 4px', background: '#0f172a', borderRadius: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color }}>{g}등급</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ─── TRACK SELECTION ──────────────────────────────────────────────────────
  if (phase === 'track') return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <button onClick={() => setPhase('landing')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <ChevronLeft size={16} /> 돌아가기
        </button>
        <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>응시 유형 선택</h2>
        <p style={{ color: '#94a3b8', marginBottom: 36 }}>자신의 수능 수학 응시 유형을 선택해주세요</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
          {[
            { key: '가형', label: '수학 가형', sub: '이과 (이공계)', desc: '미적분, 기하, 확률과 통계', color: '#2563eb' },
            { key: '나형', label: '수학 나형', sub: '문과 (인문·사회계)', desc: '수학Ⅱ, 확률과 통계, 미적분', color: '#2563EB' },
          ].map(({ key, label, sub, desc, color }) => (
            <button
              key={key}
              onClick={() => { setTrack(key); loadProblems(key) }}
              style={{
                background: track === key ? color : '#1e293b',
                border: `2px solid ${track === key ? color : '#334155'}`,
                borderRadius: 16, padding: '32px 24px', cursor: 'pointer', textAlign: 'left',
                color: '#fff', transition: 'all 0.18s'
              }}
              onMouseEnter={e => { if (track !== key) e.currentTarget.style.borderColor = color }}
              onMouseLeave={e => { if (track !== key) e.currentTarget.style.borderColor = '#334155' }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 13, color: track === key ? 'rgba(255,255,255,0.8)' : '#94a3b8', marginBottom: 10 }}>{sub}</div>
              <div style={{ fontSize: 12, color: track === key ? 'rgba(255,255,255,0.6)' : '#64748b' }}>{desc}</div>
            </button>
          ))}
        </div>
        {track && (
          <button
            className="btn"
            onClick={startTest}
            disabled={loadingProblems || problems.length === 0}
            style={{
              width: '100%', height: 56, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#1e293b', fontWeight: 900, fontSize: 17, borderRadius: 12,
              boxShadow: '0 8px 32px rgba(251,191,36,0.25)'
            }}
          >
            {loadingProblems ? '문제 불러오는 중...' : problems.length === 0 ? '문제가 없습니다' : `시험 시작 — ${track} (${problems.length}문제)`}
          </button>
        )}
      </div>
    </div>
  )

  // ─── TEST MODE ─────────────────────────────────────────────────────────────
  if (phase === 'test') {
    const problem = problems[currentQ]
    if (!problem) return null
    const answered = isMC(currentQ) ? answers[currentQ] !== null : shortInputs[currentQ].trim() !== ''
    const allAnswered = problems.every((_, i) => isMC(i) ? answers[i] !== null : shortInputs[i].trim() !== '')
    const timerColor = timeLeft < 600 ? '#dc2626' : timeLeft < 1800 ? '#d97706' : '#fbbf24'

    return (
      <div style={{ background: '#0f172a', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>

        {/* Top bar */}
        <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
            2026학년도 수능 수학 영역 ({track})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: timeLeft < 600 ? '#7f1d1d' : '#0f172a', padding: '8px 18px', borderRadius: 10, border: `1px solid ${timerColor}40` }}>
            <Clock size={16} color={timerColor} strokeWidth={2} />
            <span style={{ fontSize: 18, fontWeight: 900, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <button
            onClick={submitTest}
            style={{
              background: allAnswered ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : '#334155',
              color: allAnswered ? '#1e293b' : '#94a3b8',
              border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer'
            }}
          >
            제출
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Question palette sidebar */}
          <div style={{ width: 220, background: '#1e293b', borderRight: '1px solid #334155', padding: '16px', overflow: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>문제 목록</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>▶ 객관식 (1~20번)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {Array.from({ length: 20 }, (_, i) => (
                  <button key={i} onClick={() => goTo(i)} style={{
                    width: '100%', aspectRatio: '1', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: currentQ === i ? '#2563eb' : answers[i] !== null ? '#1d4ed8' : '#334155',
                    color: currentQ === i ? '#fff' : answers[i] !== null ? '#93c5fd' : '#94a3b8',
                    fontSize: 12, fontWeight: 700
                  }}>{i + 1}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>▶ 단답형 (21~30번)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <button key={i+20} onClick={() => goTo(i + 20)} style={{
                    width: '100%', aspectRatio: '1', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: currentQ === i+20 ? '#2563EB' : shortInputs[i+20].trim() !== '' ? '#1D4ED8' : '#334155',
                    color: currentQ === i+20 ? '#fff' : shortInputs[i+20].trim() !== '' ? '#c4b5fd' : '#94a3b8',
                    fontSize: 12, fontWeight: 700
                  }}>{i + 21}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: '#64748b' }}>
              <div>● 답함: {answers.filter(a => a !== null).length + shortInputs.filter(s => s.trim()).length}문제</div>
              <div style={{ marginTop: 4 }}>○ 미답: {TOTAL_QUESTIONS - answers.filter(a => a !== null).length - shortInputs.filter(s => s.trim()).length}문제</div>
            </div>
          </div>

          {/* Question area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '28px 40px' }}>
            {/* Question header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: isMC(currentQ) ? '#2563eb' : '#2563EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 900, flexShrink: 0
              }}>{currentQ + 1}</div>
              <div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {isMC(currentQ) ? `객관식 · 2.5점` : `단답형 · ${pointsFor(currentQ)}점`}
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  {problem.grade} · {problem.topic}
                </div>
              </div>
            </div>

            {/* Question text */}
            <div style={{ background: '#1e293b', borderRadius: 16, padding: '28px', marginBottom: 24, border: '1px solid #334155', fontSize: 18, lineHeight: 1.9, color: '#e2e8f0' }}>
              <MathBlock latex={problem.question_latex} />
            </div>

            {/* MC options or short answer */}
            {isMC(currentQ) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(problem.mc_options || []).map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setAnswers(prev => { const next = [...prev]; next[currentQ] = i; return next })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 20px', borderRadius: 12, border: '2px solid',
                      borderColor: answers[currentQ] === i ? '#2563eb' : '#334155',
                      background: answers[currentQ] === i ? '#1d4ed8' : '#1e293b',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: '#e2e8f0'
                    }}
                    onMouseEnter={e => { if (answers[currentQ] !== i) e.currentTarget.style.borderColor = '#475569' }}
                    onMouseLeave={e => { if (answers[currentQ] !== i) e.currentTarget.style.borderColor = '#334155' }}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: answers[currentQ] === i ? '#2563eb' : '#334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700
                    }}>{OPTION_LABELS[i]}</span>
                    <span style={{ fontSize: 16, lineHeight: 1.6 }}><MathText text={opt} /></span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>
                  정답을 입력하세요 (숫자만 입력 가능)
                </div>
                <input
                  type="text"
                  value={shortInputs[currentQ]}
                  onChange={e => setShortInputs(prev => { const next = [...prev]; next[currentQ] = e.target.value; return next })}
                  placeholder="답 입력..."
                  style={{
                    width: '100%', maxWidth: 320, height: 52, padding: '0 16px',
                    background: '#1e293b', border: '2px solid',
                    borderColor: shortInputs[currentQ] ? '#2563EB' : '#334155',
                    borderRadius: 12, color: '#e2e8f0', fontSize: 18, fontWeight: 700,
                    outline: 'none'
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && currentQ < TOTAL_QUESTIONS - 1) goTo(currentQ + 1) }}
                />
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button disabled={currentQ === 0} onClick={() => goTo(currentQ - 1)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10,
                background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                fontSize: 14, cursor: currentQ === 0 ? 'not-allowed' : 'pointer', opacity: currentQ === 0 ? 0.4 : 1
              }}>
                <ChevronLeft size={16} /> 이전
              </button>
              {currentQ < TOTAL_QUESTIONS - 1 ? (
                <button onClick={() => goTo(currentQ + 1)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10,
                  background: '#2563eb', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700
                }}>
                  다음 <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={submitTest} style={{
                  padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  border: 'none', color: '#1e293b', fontSize: 14, cursor: 'pointer', fontWeight: 900
                }}>
                  시험 제출
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── RESULTS ──────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const { score, detail, gradeInfo } = computeResults()
    const correct = detail.filter(d => d.correct).length
    const wrong = detail.filter(d => !d.correct).length
    const timeUsed = TOTAL_SECONDS - timeLeft
    const avgTime = Math.round(timeUsed / TOTAL_QUESTIONS)

    return (
      <div style={{ background: '#0f172a', minHeight: '100vh', color: '#fff', padding: '40px 20px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* Score hero */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 13, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
              2026학년도 수능 수학 영역 · {track}
            </div>
            <div style={{ fontSize: 96, fontWeight: 900, color: gradeInfo.color, lineHeight: 1, marginBottom: 8 }}>
              {score}점
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, color: '#fbbf24', marginBottom: 16 }}>
              {gradeInfo.grade}등급
            </div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', background: '#1e293b', padding: '8px 20px', borderRadius: 24, border: '1px solid #334155', fontSize: 14, color: '#94a3b8' }}>
              예상 백분위 · <strong style={{ color: '#e2e8f0' }}>상위 {gradeInfo.percentile}%</strong>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 32 }}>
            {[
              { label: '정답', value: correct, sub: '문제', color: '#22c55e' },
              { label: '오답', value: wrong, sub: '문제', color: '#ef4444' },
              { label: '원점수', value: score, sub: '/ 100점', color: '#fbbf24' },
              { label: '소요 시간', value: `${Math.floor(timeUsed/60)}분`, sub: `평균 ${avgTime}초/문제`, color: '#94a3b8' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: '#1e293b', borderRadius: 16, padding: '20px', textAlign: 'center', border: '1px solid #334155' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-question review */}
          <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', marginBottom: 24 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #334155' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>문제별 결과</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: 6, padding: '16px 20px' }}>
              {detail.map((d, i) => (
                <div key={i} style={{
                  aspectRatio: '1', borderRadius: 8,
                  background: d.correct ? '#14532d' : '#7f1d1d',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  color: d.correct ? '#86efac' : '#fca5a5'
                }}>
                  {i + 1}
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 20px 16px', display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#14532d', display: 'inline-block' }} /> 정답</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#7f1d1d', display: 'inline-block' }} /> 오답</span>
            </div>
          </div>

          {/* Wrong questions with AI explanation hint */}
          {detail.filter(d => !d.correct).length > 0 && (
            <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', marginBottom: 32 }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={18} color="#ef4444" strokeWidth={2} />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>틀린 문제 ({wrong}개)</h3>
              </div>
              {detail.filter(d => !d.correct).slice(0, 5).map((d, i) => (
                <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1e3a5f' }}>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                    {problems.indexOf(d.problem) + 1}번 · {d.problem.topic}
                    <span style={{ marginLeft: 8, color: '#ef4444' }}>{d.pts}점 실점</span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.7 }}>
                    <MathText text={d.problem.question_latex.slice(0, 120) + (d.problem.question_latex.length > 120 ? '...' : '')} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>정답: </span>
                    <span style={{ color: '#86efac', fontWeight: 700 }}><MathText text={d.problem.answer_latex} /></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setPhase('track'); setTrack(null) }}
              style={{ flex: 1, minWidth: 160, height: 52, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              다시 응시하기
            </button>
            <button
              onClick={() => setPhase('landing')}
              style={{ flex: 1, minWidth: 160, height: 52, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', border: 'none', color: '#1e293b', borderRadius: 12, fontWeight: 900, fontSize: 15, cursor: 'pointer' }}
            >
              수능 대비 홈
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
