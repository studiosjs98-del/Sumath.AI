import React, { useState, useRef } from 'react'
import katex from 'katex'
import api from '../utils/api'
import { MathText } from './MathRenderer'

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
      let ansHtml
      try { ansHtml = katex.renderToString(m[1].trim(), { displayMode: false, throwOnError: false, strict: 'ignore', output: 'html' }) }
      catch { ansHtml = esc(m[1]) }
      result += `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:#F0F4FF;border:2px solid #4F7EFF;border-radius:6px;font-weight:700">${ansHtml}</span>`
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

function MasteryToast({ toast }) {
  if (!toast) return null
  const isComplete = toast.level === 3
  return (
    <div style={{
      margin: '12px 0 0',
      padding: '10px 16px',
      background: isComplete ? '#F0FDF4' : '#EFF6FF',
      border: `1px solid ${isComplete ? '#86EFAC' : '#BFDBFE'}`,
      borderRadius: 8,
      fontSize: 13,
      color: isComplete ? '#15803D' : '#1D4ED8',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      animation: 'fadeInUp 0.25s ease',
    }}>
      {isComplete
        ? <><span style={{ fontSize: 15 }}>✓</span> 개념 완료! 취약 개념에서 제거됐어</>
        : <>실력이 늘고 있어! 한 번만 더 맞히면 완료야</>
      }
    </div>
  )
}

export function PracticePanel({ questions, loading, onClose, onWrongAnswer }) {
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [currentQ, setCurrentQ] = useState(0)
  const [showSteps, setShowSteps] = useState({})
  const [openSteps, setOpenSteps] = useState(new Set())
  const [score, setScore] = useState({ correct: 0, wrong: 0 })
  const [masteryToast, setMasteryToast] = useState(null)
  const toastTimer = useRef(null)
  const sessionSaved = useRef(false)

  const toggleStep = (i) => {
    setOpenSteps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  const total = questions.length
  const q = questions[currentQ]
  const selected = answers[currentQ]
  const isRevealing = revealed[currentQ]
  const stepsVisible = showSteps[currentQ]

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
            setMasteryToast({ level: 2, concept_tag: q.topic })
            toastTimer.current = setTimeout(() => setMasteryToast(null), 3000)
          } else if (mastery_level === 3 && prev_level < 3) {
            clearTimeout(toastTimer.current)
            setMasteryToast({ level: 3, concept_tag: q.topic })
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

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E5E7EB', borderTopColor: '#4F7EFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1E3A8A', marginBottom: 8 }}>문제 생성 중...</div>
        <div style={{ fontSize: 13, color: '#6B7280' }}>잠시만 기다려주세요</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: '#4F7EFF',
              animation: 'bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`
            }} />
          ))}
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
        문제가 없습니다.
      </div>
    )
  }

  if (total > 0 && score.correct + score.wrong >= total) {
    const percent = score.correct / total
    const stars = score.correct
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {[1,2,3,4,5,6,7,8,9,10].slice(0, total).map(i => (
            <svg key={i} width="22" height="22" viewBox="0 0 24 24"
              fill={i <= stars ? '#F59E0B' : 'none'}
              stroke={i <= stars ? '#F59E0B' : '#D1D5DB'} strokeWidth="1.5">
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
            </svg>
          ))}
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#1E3A8A', marginBottom: 6 }}>{score.correct} / {total}</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 32, lineHeight: 1.6 }}>
          {percent >= 0.8 ? '완벽해! 개념을 완전히 이해했어.' : percent >= 0.6 ? '잘했어. 조금만 더 연습하면 완벽해질 거야.' : '다시 한번 풀어보자. 개념 복습이 도움이 될 거야.'}
        </div>
        <button
          onClick={onClose}
          style={{ padding: '12px 28px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          닫기
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #E5E7EB', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>문제 {currentQ + 1} / {total}</span>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 700 }}>맞은 문제: {score.correct}</span>
            <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 700 }}>틀린 문제: {score.wrong}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => {
            const ans = revealed[i]
            const correct = ans && answers[i] === questions[i]?.correct_index
            const wrong = ans && answers[i] !== questions[i]?.correct_index
            return (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: correct ? '#86EFAC' : wrong ? '#FCA5A5' : '#E5E7EB', transition: 'background 0.4s ease' }} />
            )
          })}
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {q && (
          <div style={{ fontSize: 15, lineHeight: 1.9, color: '#1f2937', marginBottom: 16 }}>
            <MathText text={q.question_latex} />
          </div>
        )}

        {q && (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
            {q.options.map((opt, oi) => {
              const isSelected = selected === oi
              const isCorrect = oi === q.correct_index
              const isWrongSelected = isRevealing && isSelected && !isCorrect
              let bg = '#fff', border = '1px solid #E5E7EB', color = '#374151', fontWeight = 400
              let badgeBg = 'transparent', badgeBorder = '#D1D5DB', badgeColor = '#6B7280'
              if (isRevealing) {
                if (isCorrect) { bg = '#F0FDF4'; border = '1.5px solid #16A34A'; color = '#15803D'; fontWeight = 600; badgeBg = '#16A34A'; badgeBorder = '#16A34A'; badgeColor = '#fff' }
                else if (isSelected) { bg = '#FFF0F0'; border = '1.5px solid #FCA5A5'; color = '#991B1B'; badgeBg = '#FCA5A5'; badgeBorder = '#FCA5A5'; badgeColor = '#fff' }
              } else if (isSelected) {
                bg = '#EFF6FF'; border = '1.5px solid #2563EB'; color = '#1D4ED8'; fontWeight = 600; badgeBg = '#2563EB'; badgeBorder = '#2563EB'; badgeColor = '#fff'
              }
              return (
                <div key={oi} style={{ marginBottom: 8 }}>
                  {isWrongSelected ? (
                    <div style={{ padding: '14px 16px', background: '#FFF0F0', border: '1.5px solid #FCA5A5', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#FCA5A5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, flexShrink: 0 }}>✕</span>
                        <span style={{ fontSize: 14 }}><MathText text={String(opt)} /></span>
                      </div>
                      {q.wrongAnswerExplanation && (
                        <div style={{ fontSize: 13, color: '#991B1B', marginTop: 8, paddingLeft: 40, lineHeight: 1.7 }}>
                          <MathText text={q.wrongAnswerExplanation} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => !isRevealing && setAnswers(a => ({ ...a, [currentQ]: oi }))}
                      style={{ width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 10, border, background: bg, color, fontWeight, fontSize: 14, lineHeight: 1.6, cursor: isRevealing ? 'default' : 'pointer', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${badgeBorder}`, background: badgeBg, color: badgeColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                        {['A','B','C','D'][oi]}
                      </span>
                      <span><MathText text={String(opt)} /></span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {isRevealing && q && selected === q.correct_index && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#15803D' }}>
            ✓ 정답입니다!
            {q.wrongAnswerExplanation && (
              <div style={{ fontWeight: 400, marginTop: 6, color: '#166534', lineHeight: 1.7 }}>
                <MathText text={q.wrongAnswerExplanation} />
              </div>
            )}
          </div>
        )}
        <MasteryToast toast={isRevealing && selected === q?.correct_index ? masteryToast : null} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          {!isRevealing ? (
            <button
              onClick={handleConfirm}
              disabled={selected === undefined}
              style={{ padding: '8px 24px', background: selected !== undefined ? '#2563EB' : '#E5E7EB', color: selected !== undefined ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: selected !== undefined ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease' }}
            >
              확인
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowSteps(s => ({ ...s, [currentQ]: !s[currentQ] }))}
                style={{ background: 'transparent', border: 'none', color: '#2563EB', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0' }}
              >
                풀이 보기
              </button>
              {currentQ < total - 1 && (
                <button
                  onClick={() => { setCurrentQ(i => i + 1); setOpenSteps(new Set()) }}
                  style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginLeft: 'auto' }}
                >
                  다음 문제 →
                </button>
              )}
            </>
          )}
        </div>

        {stepsVisible && q && q.steps && q.steps.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', marginBottom: 12 }}>단계별 풀이</div>
            {q.steps.map((step, i) => {
              const isOpen = openSteps.has(i)
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div onClick={() => toggleStep(i)} style={{ padding: '11px 16px', cursor: 'pointer', background: isOpen ? '#fff' : '#F8FAFC', border: isOpen ? '1px solid #BFDBFE' : '1px solid #E5E7EB', borderLeft: isOpen ? '4px solid #2563EB' : '4px solid #E2E8F0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1E293B' }} dangerouslySetInnerHTML={{ __html: renderInline(step.title) }} />
                    <span style={{ color: '#64748B', fontSize: 16, fontWeight: 400 }}>{isOpen ? '−' : '+'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '16px 20px', fontSize: 15, lineHeight: 1.9, color: '#374151', borderLeft: '2px solid #BFDBFE', marginLeft: 20 }}>
                      <span dangerouslySetInnerHTML={{ __html: renderInline(step.content) }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {stepsVisible && q && (!q.steps || q.steps.length === 0) && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, fontSize: 13, color: '#6B7280' }}>
            <Inline text={q.answer_latex} />
          </div>
        )}
      </div>
    </div>
  )
}
