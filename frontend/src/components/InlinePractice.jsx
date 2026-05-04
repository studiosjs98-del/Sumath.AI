/**
 * InlinePractice — 5-step psychological loop injected directly into the chat.
 *
 * Step 1: Instant challenge — q1 appears immediately
 * Step 2: Instant feedback — ❌/✅ with specific wrong reason or reinforcement
 * Step 3: 2 follow-up questions (simpler if wrong, harder if right)
 * Step 4: Score as before/after framing
 * Step 5: Peak moment offer — 2 harder bonus questions on tap
 *
 * Rules:
 *   - No loading states visible
 *   - No confirm buttons — every tap resolves immediately
 *   - All transitions ≤ 500ms
 *   - Feedback ≤ 2 lines
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Inline } from '../utils/katex'
import api from '../utils/api'
import GraphComponent from './GraphComponent'

// ─── Single choice button ──────────────────────────────────────────────────────
function Choice({ id, text, state, onClick }) {
  // state: 'idle' | 'correct' | 'wrong' | 'reveal'
  const palette = {
    idle:    { bg: '#F8FAFF', border: '1.5px solid #E5E7EB', color: '#4F7EFF', labelBg: '#E0E7FF' },
    correct: { bg: '#DCFCE7', border: '1.5px solid #16A34A', color: '#16A34A', labelBg: 'transparent' },
    wrong:   { bg: '#FEE2E2', border: '1.5px solid #DC2626', color: '#DC2626', labelBg: 'transparent' },
    reveal:  { bg: '#EFF6FF', border: '1.5px solid #2563EB', color: '#2563EB', labelBg: 'transparent' },
  }[state] || { bg: '#F8FAFF', border: '1.5px solid #E5E7EB', color: '#4F7EFF', labelBg: '#E0E7FF' }

  const icon = state === 'correct' ? '✓' : state === 'wrong' ? '✗' : state === 'reveal' ? '●' : null

  return (
    <button
      onClick={state === 'idle' ? onClick : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 13px',
        background: palette.bg, border: palette.border, borderRadius: 10,
        cursor: state === 'idle' ? 'pointer' : 'default',
        textAlign: 'left', fontSize: 14, lineHeight: 1.55,
        transition: 'background 0.12s, border-color 0.12s',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { if (state === 'idle') e.currentTarget.style.background = '#EFF6FF' }}
      onMouseLeave={e => { if (state === 'idle') e.currentTarget.style.background = palette.bg }}
    >
      <span style={{
        minWidth: 22, height: 22, borderRadius: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
        background: palette.labelBg, color: palette.color,
      }}>
        {icon || id}
      </span>
      <span style={{ flex: 1, color: '#111827' }}>
        <Inline text={text} />
      </span>
    </button>
  )
}

// ─── Single question card ──────────────────────────────────────────────────────
function QuestionCard({ q, onAnswered, animate }) {
  const [selected, setSelected] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (animate && ref.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
    }
  }, [animate])

  const handleTap = (choiceId) => {
    if (selected) return
    setSelected(choiceId)
    const correct = choiceId === q.correct
    setTimeout(() => onAnswered({ chosen: choiceId, correct }), 500)
  }

  const answered = !!selected

  return (
    <div ref={ref} style={{ animation: animate ? 'ilpSlideIn 0.25s cubic-bezier(0.34,1.2,0.64,1) both' : 'none' }}>
      {q.graphExpression && (
        <div style={{ marginBottom: 10 }}>
          <GraphComponent equations={[q.graphExpression]} height={180} compact />
        </div>
      )}
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: '#111827', marginBottom: 10, fontWeight: 500 }}>
        <Inline text={q.question} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {q.choices.map(c => {
          let state = 'idle'
          if (answered) {
            if (c.id === selected && selected === q.correct) state = 'correct'
            else if (c.id === selected)                      state = 'wrong'
            else if (c.id === q.correct)                    state = 'reveal'
          }
          return <Choice key={c.id} id={c.id} text={c.text} state={state} onClick={() => handleTap(c.id)} />
        })}
      </div>

      {answered && (
        <div style={{
          marginTop: 8, padding: '7px 11px', borderRadius: 8,
          background: selected === q.correct ? '#F0FDF4' : '#FFF7ED',
          borderLeft: `3px solid ${selected === q.correct ? '#16A34A' : '#F97316'}`,
          fontSize: 13, lineHeight: 1.55, color: '#374151',
          animation: 'ilpFadeIn 0.18s ease both',
        }}>
          {selected === q.correct
            ? <><span style={{ color: '#15803D', fontWeight: 700 }}>✅ </span><span style={{ color: '#15803D', fontWeight: 600 }}>{q.right_fb}</span></>
            : <><span style={{ color: '#DC2626', fontWeight: 700 }}>❌ </span><span>{q.wrong_fb}</span></>
          }
        </div>
      )}
    </div>
  )
}

// ─── Divider with label ────────────────────────────────────────────────────────
function SectionDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, color: '#6B7280', fontWeight: 500, margin: '14px 0 10px',
    }}>
      <span style={{ flex: 0, height: 1, display: 'inline-block', width: 20, background: '#E5E7EB' }} />
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 1, display: 'inline-block', background: '#E5E7EB' }} />
    </div>
  )
}

// ─── Score display ─────────────────────────────────────────────────────────────
function ScoreBlock({ score }) {
  // score: 0–3 correct out of 3
  const messages = {
    0: { text: '0개 맞았어 — 이 유형 집중 연습이 필요해. 다시 해볼까?', color: '#DC2626', bg: '#FFF1F2' },
    1: { text: '1개 → 시작했어. 한 번 더 하면 굳혀질 거야', color: '#D97706', bg: '#FFFBEB' },
    2: { text: '0/3 → 2/3. 이 유형 잡고 있어 💪', color: '#2563EB', bg: '#EFF6FF' },
    3: { text: '완벽해. 이제 이런 문제 안 틀릴 거야 🎯', color: '#15803D', bg: '#F0FDF4' },
  }[score] || { text: '잘했어!', color: '#15803D', bg: '#F0FDF4' }

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 10,
      background: messages.bg, border: `1px solid ${messages.color}30`,
      animation: 'ilpFadeIn 0.25s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Mini progress dots */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: i < score ? messages.color : '#E5E7EB',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: messages.color }}>
          {score}/3
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6, color: '#1F2937', fontWeight: 500 }}>
        {messages.text}
      </div>
      {score >= 1 && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
          이제 이런 유형 안 틀릴 거야.
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function InlinePractice({ practice, onConceptWrong, onDismiss }) {
  /*
   * practice: { concept, difficulty, q1, followup_easy: [q,q], followup_hard: [q,q] }
   *
   * phase: 'q1' | 'followup' | 'score' | 'bonus_offer' | 'bonus_loading' | 'bonus' | 'done'
   */
  const [phase, setPhase]           = useState('q1')
  const [q1Answer, setQ1Answer]     = useState(null)    // { chosen, correct }
  const [followupAnswers, setFollowupAnswers] = useState([null, null])
  const [bonusQuestions, setBonusQuestions]   = useState(null)
  const [bonusAnswers, setBonusAnswers]       = useState([null, null])
  const [followupVisible, setFollowupVisible] = useState(0) // 0, 1, or 2 followup questions shown
  const fetchedBonus = useRef(false)

  const followupSet = q1Answer?.correct ? practice.followup_hard : practice.followup_easy
  const score = [
    q1Answer?.correct,
    followupAnswers[0]?.correct,
    followupAnswers[1]?.correct,
  ].filter(Boolean).length

  const handleQ1Answered = useCallback((result) => {
    setQ1Answer(result)
    if (!result.correct) onConceptWrong?.(practice.concept)
    // After 500ms, reveal first followup question
    setTimeout(() => {
      setPhase('followup')
      setFollowupVisible(1)
    }, 500)
  }, [onConceptWrong, practice.concept])

  const handleFollowupAnswered = useCallback((idx, result) => {
    setFollowupAnswers(prev => {
      const next = [...prev]
      next[idx] = result
      return next
    })
    if (!result.correct) onConceptWrong?.(practice.concept)

    if (idx === 0) {
      // Show second followup after 500ms
      setTimeout(() => setFollowupVisible(2), 500)
    } else {
      // Both done — show score, then offer bonus after brief pause
      setTimeout(() => setPhase('score'), 600)
      setTimeout(() => setPhase('bonus_offer'), 1400)
    }
  }, [onConceptWrong, practice.concept])

  const handleBonusAnswered = useCallback((idx, result) => {
    setBonusAnswers(prev => {
      const next = [...prev]
      next[idx] = result
      return next
    })
    if (!result.correct) onConceptWrong?.(practice.concept)
    if (idx === 1) {
      setTimeout(() => setPhase('done'), 600)
    }
  }, [onConceptWrong, practice.concept])

  const handleBonusYes = async () => {
    if (fetchedBonus.current) return
    fetchedBonus.current = true
    setPhase('bonus_loading')
    try {
      const res = await api.post('/ai-chat/inline-practice-bonus', {
        concept: practice.concept,
        difficulty: practice.difficulty,
      })
      if (res.data?.ok && Array.isArray(res.data.bonus) && res.data.bonus.length >= 1) {
        setBonusQuestions(res.data.bonus)
        setPhase('bonus')
      } else {
        setPhase('done')
      }
    } catch {
      setPhase('done')
    }
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 16 }}>

      {/* ── Tutor intro line ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #4F7EFF, #6C3EFF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'serif' }}>Σ</span>
        </div>
        <div style={{
          background: '#F0F4FF', border: '1px solid #BFDBFE',
          borderRadius: '4px 16px 16px 16px',
          padding: '9px 13px', fontSize: 13.5, lineHeight: 1.6, color: '#1E3A8A',
          maxWidth: 440,
        }}>
          대부분 학생들이 이 부분에서 틀려 — 한번 풀어봐
          {practice.concept && practice.concept !== '수학' && (
            <span style={{
              display: 'inline-block', marginLeft: 6,
              fontSize: 11, fontWeight: 700, background: '#DBEAFE',
              color: '#1D4ED8', padding: '1px 7px', borderRadius: 10,
              verticalAlign: 'middle',
            }}>
              {practice.concept}
            </span>
          )}
        </div>
      </div>

      {/* ── Content (indented to align with bubble) ── */}
      <div style={{ paddingLeft: 42 }}>

        {/* Q1 */}
        <QuestionCard
          q={practice.q1}
          onAnswered={handleQ1Answered}
          animate={false}
        />

        {/* Followup section */}
        {phase !== 'q1' && followupSet?.length > 0 && (
          <div>
            <SectionDivider label={
              q1Answer?.correct
                ? '잘했어! 비슷한 문제 2개 더 풀어봐'
                : '비슷한 문제 2개 더 풀어봐'
            } />

            {followupVisible >= 1 && followupSet[0] && (
              <QuestionCard
                key="f0"
                q={followupSet[0]}
                onAnswered={(r) => handleFollowupAnswered(0, r)}
                animate
              />
            )}

            {followupVisible >= 2 && followupSet[1] && (
              <div style={{ marginTop: 14 }}>
                <QuestionCard
                  key="f1"
                  q={followupSet[1]}
                  onAnswered={(r) => handleFollowupAnswered(1, r)}
                  animate
                />
              </div>
            )}
          </div>
        )}

        {/* Score */}
        {(phase === 'score' || phase === 'bonus_offer' || phase === 'bonus_loading' || phase === 'bonus' || phase === 'done') && (
          <div style={{ marginTop: 16 }}>
            <ScoreBlock score={score} />
          </div>
        )}

        {/* Bonus offer */}
        {phase === 'bonus_offer' && (
          <div style={{ marginTop: 12, animation: 'ilpFadeIn 0.2s ease both' }}>
            <div style={{ fontSize: 13.5, color: '#374151', fontWeight: 500, marginBottom: 8 }}>
              더 어려운 문제 2개 풀어볼래?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleBonusYes}
                style={{
                  padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'linear-gradient(135deg, #4F7EFF, #6C3EFF)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                풀어볼게
              </button>
              <button
                onClick={() => setPhase('done')}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: '#F3F4F6', color: '#6B7280', border: 'none', cursor: 'pointer',
                }}
              >
                괜찮아
              </button>
            </div>
          </div>
        )}

        {/* Bonus loading */}
        {phase === 'bonus_loading' && (
          <div style={{
            marginTop: 12, fontSize: 13, color: '#6B7280',
            animation: 'ilpFadeIn 0.2s ease both',
          }}>
            문제 만드는 중...
          </div>
        )}

        {/* Bonus questions */}
        {phase === 'bonus' && bonusQuestions && (
          <div style={{ marginTop: 14, animation: 'ilpSlideIn 0.25s cubic-bezier(0.34,1.2,0.64,1) both' }}>
            <SectionDivider label="고난도 도전" />
            <QuestionCard
              key="b0"
              q={bonusQuestions[0]}
              onAnswered={(r) => handleBonusAnswered(0, r)}
              animate
            />
            {bonusAnswers[0] && bonusQuestions[1] && (
              <div style={{ marginTop: 14 }}>
                <QuestionCard
                  key="b1"
                  q={bonusQuestions[1]}
                  onAnswered={(r) => handleBonusAnswered(1, r)}
                  animate
                />
              </div>
            )}
          </div>
        )}

        {/* Done state */}
        {phase === 'done' && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button
              onClick={onDismiss}
              style={{
                fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none',
                cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2,
              }}
            >
              닫기
            </button>
          </div>
        )}
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes ilpSlideIn {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        @keyframes ilpFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
