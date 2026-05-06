import React, { useState, useRef, useEffect } from 'react'
import katex from 'katex'
import api from '../utils/api'
import { MathText } from './MathRenderer'

const LABELS = ['A', 'B', 'C', 'D', 'E']

// ── Inject keyframes once ─────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes pp-fade-up   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes pp-slide-in  { from { opacity:0; transform:translateX(14px) } to { opacity:1; transform:translateX(0) } }
@keyframes pp-spin      { to { transform:rotate(360deg) } }
@keyframes pp-bounce    { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
`
let _ppStyleInjected = false
function ensureStyles() {
  if (_ppStyleInjected) return
  _ppStyleInjected = true
  const s = document.createElement('style')
  s.textContent = KEYFRAMES
  document.head.appendChild(s)
}

// ── KaTeX helpers ─────────────────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInline(text) {
  if (!text) return ''
  text = String(text)
  text = text.replace(/\t([a-zA-Z])/g, '\\t$1')
  text = text.replace(/\f([a-zA-Z])/g, '\\f$1')
  text = text.replace(/\x08([a-zA-Z])/g, '\\b$1')
  text = text.replace(/\\n/g, ' ')
  text = text.replace(/\\\(([^]*?)\\\)/g, '$$$1$$')
  text = text.replace(/\\\[([^]*?)\\\]/g, '$$$$$1$$$$')
  text = text.replace(/\\\\boxed/g, '\\boxed')
  text = text.replace(/\$\$\\boxed\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\$\$/g, '[ANSWER]$1[/ANSWER]')
  text = text.replace(/\$\\boxed\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\$/g, '[ANSWER]$1[/ANSWER]')
  const re = /\[ANSWER\]([\s\S]+?)\[\/ANSWER\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let result = '', lastIndex = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) result += esc(text.slice(lastIndex, m.index))
    if (m[1] !== undefined) {
      let h
      try { h = katex.renderToString(m[1].trim(), { displayMode: false, throwOnError: false, strict: 'ignore', output: 'html' }) }
      catch { h = esc(m[1]) }
      result += `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:#F0F4FF;border:2px solid #4F7EFF;border-radius:6px;font-weight:700">${h}</span>`
    } else if (m[2] !== undefined) {
      result += `<strong>${renderInline(m[2])}</strong>`
    } else if (m[3] !== undefined) {
      result += `<em>${renderInline(m[3])}</em>`
    } else if (m[4] !== undefined) {
      try { result += `<span style="display:inline-block;margin:4px 0">${katex.renderToString(m[4].trim(), { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html' })}</span>` }
      catch { result += esc(m[0]) }
    } else {
      try { result += katex.renderToString(m[5].trim(), { displayMode: false, throwOnError: false, strict: 'ignore', output: 'html' }) }
      catch { result += esc(m[0]) }
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) result += esc(text.slice(lastIndex))
  return result
}

function Inline({ text }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
}

// ── Option card ───────────────────────────────────────────────────────────────
function OptionCard({ label, text, state, disabled, onClick }) {
  const [hovered, setHovered] = useState(false)

  const base = {
    width: '100%', textAlign: 'left',
    padding: '14px 18px', borderRadius: 14,
    border: '1.5px solid #E5E7EB', background: '#fff',
    color: '#1E293B', fontSize: 15, fontWeight: 400,
    lineHeight: 1.6, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 14,
    transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    outline: 'none',
  }

  const styles = {
    idle:     { ...base },
    hovered:  { ...base, borderColor: '#93C5FD', background: '#F0F6FF', boxShadow: '0 2px 8px rgba(37,99,235,0.1)' },
    selected: { ...base, borderColor: '#2563EB', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600, boxShadow: '0 2px 8px rgba(37,99,235,0.15)' },
    correct:  { ...base, borderColor: '#16A34A', background: '#F0FDF4', color: '#15803D', fontWeight: 600, cursor: 'default' },
    wrong:    { ...base, borderColor: '#FCA5A5', background: '#FFF0F0', color: '#991B1B', cursor: 'default' },
  }

  const labelStyles = {
    idle:     { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #CBD5E1', background: 'transparent', color: '#64748B', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' },
    selected: { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #2563EB', background: '#2563EB', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
    correct:  { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #16A34A', background: '#16A34A', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
    wrong:    { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #FCA5A5', background: '#FCA5A5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  }

  const activeStyle = state === 'idle' ? (hovered && !disabled ? styles.hovered : styles.idle)
    : state === 'selected' ? styles.selected
    : state === 'correct'  ? styles.correct
    : styles.wrong

  const activeLabelStyle = state === 'idle' || state === 'hovered' ? labelStyles.idle
    : state === 'selected' ? labelStyles.selected
    : state === 'correct'  ? labelStyles.correct
    : labelStyles.wrong

  return (
    <button
      style={activeStyle}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={activeLabelStyle}>{label}</span>
      <span style={{ flex: 1 }}><MathText text={String(text)} /></span>
      {state === 'correct' && <span style={{ fontSize: 18, color: '#16A34A', fontWeight: 700, flexShrink: 0 }}>✓</span>}
      {state === 'wrong'   && <span style={{ fontSize: 18, color: '#EF4444', fontWeight: 700, flexShrink: 0 }}>✗</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function PracticePanel({ questions, loading, onClose, onWrongAnswer }) {
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [currentQ, setCurrentQ] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [openSteps, setOpenSteps] = useState(new Set())
  const [score, setScore] = useState({ correct: 0, wrong: 0 })
  const [masteryToast, setMasteryToast] = useState(null)
  const [animKey, setAnimKey] = useState(0)
  const [hintHover, setHintHover] = useState(false)
  const toastTimer = useRef(null)
  const sessionSaved = useRef(false)

  useEffect(() => { ensureStyles() }, [])

  const toggleStep = (i) => {
    setOpenSteps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  const total = questions.length
  const q = questions[currentQ]
  const selected = answers[currentQ]
  const isRevealing = !!revealed[currentQ]
  const topic = questions[0]?.topic || '연습 문제'

  const handleConfirm = () => {
    if (selected === undefined || !q) return
    setRevealed(r => ({ ...r, [currentQ]: true }))
    const isCorrect = selected === q.correct_index
    if (isCorrect) {
      api.post('/analysis/record-correct', { concept_tag: q.topic || '' })
        .then(r => {
          const { mastery_level, prev_level } = r.data || {}
          if (mastery_level === 2 && prev_level < 2) {
            clearTimeout(toastTimer.current)
            setMasteryToast({ level: 2 })
            toastTimer.current = setTimeout(() => setMasteryToast(null), 3000)
          } else if (mastery_level === 3 && prev_level < 3) {
            clearTimeout(toastTimer.current)
            setMasteryToast({ level: 3 })
            toastTimer.current = setTimeout(() => setMasteryToast(null), 3500)
          }
        })
        .catch(() => {})
    } else {
      onWrongAnswer?.({
        question_text: q.question_latex,
        correct_answer: q.options[q.correct_index] || q.answer_latex || '',
        student_answer: q.options[selected] || '',
        topic: q.topic || '',
        concept_tag: q.topic || ''
      })
    }
    const newScore = isCorrect
      ? { correct: score.correct + 1, wrong: score.wrong }
      : { correct: score.correct, wrong: score.wrong + 1 }
    setScore(newScore)
    if (!sessionSaved.current && newScore.correct + newScore.wrong >= total) {
      sessionSaved.current = true
      api.post('/analysis/practice-sessions', { score: newScore.correct, total }).catch(() => {})
    }
  }

  const goNext = () => {
    setCurrentQ(i => i + 1)
    setHintOpen(false)
    setOpenSteps(new Set())
    setAnimKey(k => k + 1)
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'pp-spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A8A' }}>문제 생성 중...</div>
        <div style={{ fontSize: 13, color: '#64748B' }}>잠시만 기다려주세요</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', animation: `pp-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return <div style={{ padding: '80px 24px', textAlign: 'center', color: '#64748B', fontSize: 14 }}>문제가 없습니다.</div>
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (total > 0 && score.correct + score.wrong >= total) {
    const pct = score.correct / total
    const grade = pct >= 0.8
      ? { emoji: '🎉', msg: '완벽해! 개념을 완전히 이해했어.', color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' }
      : pct >= 0.6
      ? { emoji: '👏', msg: '잘했어. 조금만 더 연습하면 완벽해질 거야.', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' }
      : { emoji: '📖', msg: '다시 한번 풀어보자. 개념 복습이 도움이 될 거야.', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' }
    return (
      <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'pp-fade-up 0.4s ease' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{grade.emoji}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{topic}</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: '#0F172A', lineHeight: 1, marginBottom: 6 }}>
          {score.correct}<span style={{ fontSize: 22, fontWeight: 400, color: '#94A3B8' }}> / {total}</span>
        </div>
        <div style={{ padding: '10px 20px', borderRadius: 12, background: grade.bg, border: `1px solid ${grade.border}`, color: grade.color, fontSize: 13, fontWeight: 600, marginBottom: 28, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
          {grade.msg}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {Array.from({ length: total }).map((_, i) => {
            const ok = revealed[i] && answers[i] === questions[i]?.correct_index
            return (
              <div key={i} style={{ width: 38, height: 38, borderRadius: '50%', background: ok ? '#F0FDF4' : '#FFF0F0', border: `2px solid ${ok ? '#16A34A' : '#FCA5A5'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: ok ? '#16A34A' : '#EF4444' }}>
                {ok ? '✓' : '✗'}
              </div>
            )
          })}
        </div>
        <button
          onClick={onClose}
          style={{ padding: '12px 36px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}
        >
          닫기
        </button>
      </div>
    )
  }

  // ── Quiz ─────────────────────────────────────────────────────────────────────
  const hasHint = q && ((q.steps && q.steps.length > 0) || q.answer_latex)
  const isCorrectAnswer = isRevealing && selected === q?.correct_index

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#f5f5f5' }}>

      {/* ── Progress header ──────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F1F5FF', background: '#FAFBFF', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '4px 12px', borderRadius: 100, letterSpacing: '-0.01em' }}>
            {topic}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>
              {currentQ + 1} <span style={{ color: '#CBD5E1' }}>/</span> {total}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>✓</span>{score.correct}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>✗</span>{score.wrong}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => {
            const ans = revealed[i]
            const ok = ans && answers[i] === questions[i]?.correct_index
            const bad = ans && answers[i] !== questions[i]?.correct_index
            const active = i === currentQ
            return (
              <div key={i} style={{
                flex: 1, height: 5, borderRadius: 3,
                background: ok ? '#16A34A' : bad ? '#EF4444' : active ? '#2563EB' : '#E2E8F0',
                opacity: active && !ans ? 0.7 : 1,
                transition: 'background 0.4s ease',
              }} />
            )
          })}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div
        key={animKey}
        style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 8px', animation: 'pp-slide-in 0.25s ease' }}
      >
        {/* Question */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            문제 {currentQ + 1}
          </span>
          <div style={{ fontSize: 15, lineHeight: 1.9, color: '#0F172A', marginTop: 6, fontWeight: 500 }}>
            {q && <MathText text={q.question_latex} />}
          </div>
        </div>

        {/* Options */}
        {q && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
            {q.options.map((opt, oi) => {
              const isSelected = selected === oi
              const isCorrect = oi === q.correct_index
              let state = 'idle'
              if (isRevealing) {
                if (isCorrect) state = 'correct'
                else if (isSelected) state = 'wrong'
              } else if (isSelected) {
                state = 'selected'
              }
              return (
                <OptionCard
                  key={oi}
                  label={LABELS[oi]}
                  text={opt}
                  state={state}
                  disabled={isRevealing}
                  onClick={() => !isRevealing && setAnswers(a => ({ ...a, [currentQ]: oi }))}
                />
              )
            })}
          </div>
        )}

        {/* Feedback banner */}
        {isRevealing && q && (
          <div style={{
            marginTop: 16, padding: '14px 18px', borderRadius: 12,
            animation: 'pp-fade-up 0.25s ease',
            ...(isCorrectAnswer
              ? { background: '#F0FDF4', border: '1px solid #BBF7D0' }
              : { background: '#FFF0F0', border: '1px solid #FCA5A5' })
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: isCorrectAnswer ? '#15803D' : '#991B1B', marginBottom: q.wrongAnswerExplanation ? 6 : 0 }}>
              {isCorrectAnswer ? '✓ 정답입니다!' : '✗ 오답입니다'}
            </div>
            {q.wrongAnswerExplanation && (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: isCorrectAnswer ? '#166534' : '#991B1B' }}>
                <MathText text={q.wrongAnswerExplanation} />
              </div>
            )}
          </div>
        )}

        {/* Mastery toast */}
        {masteryToast && isCorrectAnswer && (
          <div style={{
            marginTop: 10, padding: '10px 16px', borderRadius: 10,
            background: masteryToast.level === 3 ? '#F0FDF4' : '#EFF6FF',
            border: `1px solid ${masteryToast.level === 3 ? '#86EFAC' : '#BFDBFE'}`,
            fontSize: 13, fontWeight: 500,
            color: masteryToast.level === 3 ? '#15803D' : '#1D4ED8',
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'pp-fade-up 0.25s ease',
          }}>
            {masteryToast.level === 3
              ? <><span>✓</span> 개념 완료! 취약 개념에서 제거됐어</>
              : <>실력이 늘고 있어! 한 번만 더 맞히면 완료야</>}
          </div>
        )}

        {/* Hint section */}
        {hasHint && (
          <div style={{ marginTop: 18, borderTop: '1px solid #F1F5FF' }}>
            <button
              onClick={() => setHintOpen(o => !o)}
              onMouseEnter={() => setHintHover(true)}
              onMouseLeave={() => setHintHover(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: hintHover ? '#1D4ED8' : '#2563EB', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '10px 0', width: '100%' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>
              힌트 {hintOpen ? '숨기기' : '보기'}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', transform: hintOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {hintOpen && (
              <div style={{ animation: 'pp-fade-up 0.2s ease', paddingBottom: 8 }}>
                {q.steps && q.steps.length > 0 ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>단계별 풀이</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {q.steps.map((step, i) => {
                        const isOpen = openSteps.has(i)
                        return (
                          <div key={i}>
                            <button
                              onClick={() => toggleStep(i)}
                              style={{ width: '100%', textAlign: 'left', padding: '11px 16px', cursor: 'pointer', background: isOpen ? '#fff' : '#F8FAFC', border: `1px solid ${isOpen ? '#BFDBFE' : '#E5E7EB'}`, borderLeft: `4px solid ${isOpen ? '#2563EB' : '#E2E8F0'}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}
                            >
                              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#1E293B' }} dangerouslySetInnerHTML={{ __html: renderInline(step.title) }} />
                              <span style={{ color: '#64748B', fontSize: 16 }}>{isOpen ? '−' : '+'}</span>
                            </button>
                            {isOpen && (
                              <div style={{ padding: '14px 20px', fontSize: 14, lineHeight: 1.9, color: '#374151', borderLeft: '2px solid #BFDBFE', marginLeft: 20 }}>
                                <span dangerouslySetInnerHTML={{ __html: renderInline(step.content) }} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : q.answer_latex && (
                  <div style={{ padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
                    <Inline text={q.answer_latex} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action bar ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5FF', background: '#FAFBFF', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
        {!isRevealing ? (
          <ConfirmButton disabled={selected === undefined} onClick={handleConfirm} />
        ) : currentQ < total - 1 ? (
          <NextButton onClick={goNext} />
        ) : null}
      </div>
    </div>
  )
}

function ConfirmButton({ disabled, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '11px 32px', border: 'none', borderRadius: 12,
        fontSize: 14, fontWeight: 700,
        background: disabled ? '#E5E7EB' : hov ? '#1D4ED8' : '#2563EB',
        color: disabled ? '#9CA3AF' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: disabled ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
      }}
    >
      확인
    </button>
  )
}

function NextButton({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '11px 28px', border: 'none', borderRadius: 12,
        fontSize: 14, fontWeight: 700,
        background: hov ? '#1D4ED8' : '#2563EB',
        color: '#fff', cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      다음 문제
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  )
}
