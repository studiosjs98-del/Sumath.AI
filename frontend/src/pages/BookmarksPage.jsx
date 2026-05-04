import React, { useState, useEffect, useCallback } from 'react'
import { Bookmark, BookmarkX, RotateCcw, ChevronRight, CheckCircle, XCircle, Loader } from 'lucide-react'
import api from '../utils/api'
import { MathBlock, MathText } from '../components/MathRenderer'
import useStore from '../store/useStore'

const GREY = '#6B7280'

function triggerConfetti() {
  const colors = ['#2563EB','#38BDF8','#10B981','#F59E0B','#EF4444','#0EA5E9']
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div')
    const tx = (Math.random() - 0.5) * 300
    const ty = -(Math.random() * 250 + 80)
    el.style.cssText = `
      position:fixed; left:50%; top:50%; width:8px; height:8px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      background:${colors[i % colors.length]};
      pointer-events:none; z-index:9999;
      --tx:${tx}px; --ty:${ty}px;
      animation: confettiPop 0.9s ease-out forwards;
    `
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 950)
  }
}

export default function BookmarksPage() {
  const { submitAttempt, addXp } = useStore()

  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)
  const [studyMode, setStudyMode] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  // Per-question state
  const [selectedOption, setSelectedOption] = useState(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [shakingOption, setShakingOption] = useState(null)
  const [explanation, setExplanation] = useState('')
  const [explanationLoading, setExplanationLoading] = useState(false)
  const [results, setResults] = useState([]) // { correct: bool } per problem

  const fetchBookmarks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/bookmarks')
      setBookmarks(res.data.bookmarks || [])
    } catch {
      setBookmarks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBookmarks() }, [fetchBookmarks])

  const removeBookmark = async (problemId) => {
    try {
      await api.post(`/bookmarks/${problemId}`)
      setBookmarks(prev => prev.filter(b => b.problem_id !== problemId))
    } catch {}
  }

  const startStudy = () => {
    setStudyMode(true)
    setCurrentIdx(0)
    setResults([])
    resetQuestion()
  }

  const resetQuestion = () => {
    setSelectedOption(null)
    setIsAnswered(false)
    setIsCorrect(false)
    setExplanation('')
    setExplanationLoading(false)
    setShakingOption(null)
  }

  const problem = bookmarks[currentIdx]

  const handleSelect = async (idx) => {
    if (isAnswered) return
    setSelectedOption(idx)
    const correct = idx === problem.correct_option_index
    setIsCorrect(correct)
    setIsAnswered(true)

    if (correct) {
      triggerConfetti()
      if (addXp) addXp(10)
    } else {
      setShakingOption(idx)
      setTimeout(() => setShakingOption(null), 600)
    }

    setResults(prev => [...prev, { correct }])

    // Fetch explanation
    setExplanationLoading(true)
    try {
      const res = await api.post(`/study/${problem.id}/explain`, {
        isCorrect: correct,
        selectedOptionText: problem.mc_options?.[idx] || ''
      })
      setExplanation(res.data.explanation || '')
    } catch {
      setExplanation('설명을 불러올 수 없습니다.')
    } finally {
      setExplanationLoading(false)
    }
  }

  const handleNext = () => {
    if (currentIdx < bookmarks.length - 1) {
      setCurrentIdx(prev => prev + 1)
      resetQuestion()
    } else {
      setStudyMode(false)
    }
  }

  const optionLabel = (i) => ['A', 'B', 'C', 'D'][i]

  const getOptionStyle = (i) => {
    const base = {
      padding: '14px 18px', borderRadius: '10px', cursor: isAnswered ? 'default' : 'pointer',
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      border: '2px solid', transition: 'all 0.2s',
      animation: shakingOption === i ? 'mcShake 0.5s ease-in-out' : 'none',
      fontSize: '16px'
    }
    if (!isAnswered) {
      return {
        ...base,
        borderColor: selectedOption === i ? 'var(--primary)' : 'var(--border)',
        background: selectedOption === i ? 'var(--primary-light)' : 'white'
      }
    }
    if (i === problem.correct_option_index) {
      return { ...base, borderColor: '#059669', background: '#ecfdf5' }
    }
    if (i === selectedOption && !isCorrect) {
      return { ...base, borderColor: '#dc2626', background: '#fef2f2' }
    }
    return { ...base, borderColor: 'var(--border)', background: 'white', opacity: 0.5 }
  }

  // — Done screen after studying all bookmarks
  if (!studyMode && results.length > 0 && !loading) {
    const correct = results.filter(r => r.correct).length
    const pct = Math.round((correct / results.length) * 100)
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>
          {pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪'}
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>복습 완료!</h2>
        <p style={{ color: GREY, marginBottom: '32px' }}>
          {results.length}문제 중 <strong style={{ color: '#059669' }}>{correct}문제</strong> 정답 ({pct}%)
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { setResults([]); startStudy() }}>
            다시 복습하기
          </button>
          <button className="btn btn-outline" onClick={() => setResults([])}>
            목록으로
          </button>
        </div>
        <style>{`@keyframes confettiPop { 0%{transform:translate(0,0) rotate(0deg);opacity:1} 100%{transform:translate(var(--tx),var(--ty)) rotate(720deg);opacity:0} }`}</style>
      </div>
    )
  }

  // — Study mode
  if (studyMode && problem) {
    const options = problem.mc_options || []
    return (
      <div style={{ padding: '32px 20px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: GREY, fontSize: '14px' }}>
            <Bookmark size={16} color={GREY} strokeWidth={1.75} />
            복습 목록 —
            <span style={{ fontWeight: '700', color: 'var(--text)' }}>{currentIdx + 1} / {bookmarks.length}</span>
          </div>
          <button
            onClick={() => { setStudyMode(false); setResults([]) }}
            style={{ background: 'none', border: 'none', color: GREY, cursor: 'pointer', fontSize: '14px' }}
          >
            목록으로
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', marginBottom: '28px' }}>
          <div style={{
            height: '100%', borderRadius: '2px', background: 'var(--primary)',
            width: `${((currentIdx) / bookmarks.length) * 100}%`, transition: 'width 0.4s ease'
          }} />
        </div>

        {/* Problem card */}
        <div style={{
          background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
          borderRadius: '16px', padding: '28px', marginBottom: '20px',
          border: '1px solid #e0e7ff'
        }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>
              {problem.grade}
            </span>
            {problem.topic && (
              <span style={{ fontSize: '12px', background: '#f3f4f6', color: GREY, padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>
                {problem.topic}
              </span>
            )}
          </div>
          <div style={{ fontSize: '20px', lineHeight: 1.7 }}>
            <MathText text={problem.question_latex} />
          </div>
        </div>

        {/* MC Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {options.map((opt, i) => (
            <div key={i} style={getOptionStyle(i)} onClick={() => handleSelect(i)}>
              <span style={{
                minWidth: '28px', height: '28px', borderRadius: '50%',
                background: isAnswered
                  ? i === problem.correct_option_index ? '#059669' : (i === selectedOption ? '#dc2626' : 'var(--border)')
                  : (selectedOption === i ? 'var(--primary)' : 'var(--border)'),
                color: isAnswered
                  ? i === problem.correct_option_index ? 'white' : (i === selectedOption ? 'white' : GREY)
                  : (selectedOption === i ? 'white' : GREY),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '700', flexShrink: 0
              }}>
                {optionLabel(i)}
              </span>
              <span style={{ lineHeight: 1.5 }}><MathText text={opt} /></span>
            </div>
          ))}
        </div>

        {/* Result banner */}
        {isAnswered && (
          <div style={{
            padding: '14px 18px', borderRadius: '12px', marginBottom: '16px',
            background: isCorrect ? '#ecfdf5' : '#fef2f2',
            border: `1.5px solid ${isCorrect ? '#059669' : '#dc2626'}`,
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            {isCorrect
              ? <CheckCircle size={20} color="#059669" strokeWidth={2} />
              : <XCircle size={20} color="#dc2626" strokeWidth={2} />}
            <span style={{ fontWeight: '700', color: isCorrect ? '#059669' : '#dc2626', fontSize: '16px' }}>
              {isCorrect ? '정답! +10 XP' : `오답 — 정답: ${optionLabel(problem.correct_option_index)}`}
            </span>
          </div>
        )}

        {/* AI Explanation */}
        {isAnswered && (
          <div style={{
            background: 'white', borderRadius: '12px', border: '1px solid var(--border)',
            padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: '700', color: 'var(--text)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: '14px', fontWeight: '900' }}>수</span>
              </div>
              수학이의 설명
            </div>
            {explanationLoading
              ? <div style={{ display: 'flex', gap: '6px', padding: '8px 0' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: `dotB 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              : <div style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  <MathText text={explanation} />
                </div>
            }
          </div>
        )}

        {/* Next button */}
        {isAnswered && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '17px', height: '52px' }}
            onClick={handleNext}
          >
            {currentIdx < bookmarks.length - 1 ? (
              <><span>다음 문제</span> <ChevronRight size={18} strokeWidth={2} /></>
            ) : '결과 보기'}
          </button>
        )}

        <style>{`
          @keyframes mcShake {
            0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)}
          }
          @keyframes dotB {
            0%,80%,100%{transform:scale(0.7);opacity:0.5} 40%{transform:scale(1.1);opacity:1}
          }
          @keyframes confettiPop {
            0%{transform:translate(0,0) rotate(0deg);opacity:1}
            100%{transform:translate(var(--tx),var(--ty)) rotate(720deg);opacity:0}
          }
        `}</style>
      </div>
    )
  }

  // — Bookmark list view
  return (
    <div style={{ padding: '32px 20px 80px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bookmark size={28} color={GREY} strokeWidth={1.75} />
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0 }}>복습 목록</h1>
            <p style={{ color: GREY, fontSize: '14px', margin: '2px 0 0' }}>
              저장된 문제 {bookmarks.length}개
            </p>
          </div>
        </div>
        {bookmarks.length > 0 && (
          <button className="btn btn-primary" onClick={startStudy} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RotateCcw size={16} strokeWidth={2} />
            전체 복습하기
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <Loader size={32} color={GREY} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : bookmarks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: GREY }}>
          <Bookmark size={56} color={GREY} strokeWidth={1.25} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
            아직 저장된 문제가 없어요
          </h3>
          <p style={{ fontSize: '15px', lineHeight: 1.6 }}>
            문제풀기에서 <Bookmark size={14} style={{ verticalAlign: 'middle' }} /> 버튼을 눌러<br />
            어려운 문제를 복습 목록에 저장해보세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bookmarks.map((b, i) => (
            <div key={b.problem_id} style={{
              background: 'white', borderRadius: '14px', border: '1px solid var(--border)',
              padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'flex-start'
            }}
              className="card-lift"
            >
              {/* Number */}
              <div style={{
                minWidth: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--primary-light)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '700', flexShrink: 0
              }}>{i + 1}</div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '3px 8px', borderRadius: '20px', fontWeight: '600' }}>
                    {b.grade}
                  </span>
                  {b.topic && (
                    <span style={{ fontSize: '11px', background: '#f3f4f6', color: GREY, padding: '3px 8px', borderRadius: '20px', fontWeight: '600' }}>
                      {b.topic}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '16px', lineHeight: 1.6, color: 'var(--text)' }}>
                  <MathText text={b.question_latex} />
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={() => removeBookmark(b.problem_id)}
                title="북마크 제거"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px', borderRadius: '6px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <BookmarkX size={18} color="#dc2626" strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
