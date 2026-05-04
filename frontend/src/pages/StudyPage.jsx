import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, CheckCircle, XCircle, ChevronRight, ChevronLeft,
  Flag, Bookmark, BookmarkCheck, Send, Sparkles, Hash,
  Target, BookOpen, AlertCircle, RotateCcw,
  PenTool, TrendingUp, Triangle, BarChart2, GitBranch,
  Grid, List, Activity, Shuffle, PieChart, ArrowRight,
  TrendingDown, Layers, Circle, Box
} from 'lucide-react'
import useStore from '../store/useStore'
import api from '../utils/api'
import { MathBlock, MathText } from '../components/MathRenderer'
import { playCorrectSound, playWrongSound, playXPSound } from '../utils/audio'

const GREY = '#6B7280'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

const GRADE_INFO = {
  '중1': { color: '#2563EB', bg: '#EFF6FF' },
  '중2': { color: '#2563EB', bg: '#EFF6FF' },
  '중3': { color: '#2563EB', bg: '#EFF6FF' },
  '고1': { color: '#0EA5E9', bg: '#F0F9FF' },
  '고2': { color: '#0EA5E9', bg: '#F0F9FF' },
  '고3': { color: '#0EA5E9', bg: '#F0F9FF' },
}

const TIER_CONFIG = {
  basic:    { label: '기초', labelEn: 'Foundation', color: '#2563eb', bg: '#eff6ff', borderColor: '#93c5fd', desc: '개념 이해와 기본 계산' },
  medium:   { label: '보통', labelEn: 'Intermediate', color: '#d97706', bg: '#fffbeb', borderColor: '#fcd34d', desc: '응용 문제와 복합 개념' },
  advanced: { label: '심화', labelEn: 'Advanced', color: '#ea580c', bg: '#fff7ed', borderColor: '#fdba74', desc: '고난도 심화 문제' },
}

const DIFFICULTY_PILLS = [
  { key: 'basic',    label: '기초', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  { key: 'medium',   label: '보통', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  { key: 'advanced', label: '심화', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  { key: null,       label: '전체', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
]

const CATEGORY_ICONS = {
  '수와 연산': Hash,
  '문자와 식': PenTool,
  '함수와 그래프': TrendingUp,
  '도형과 측정': Triangle,
  '자료와 가능성': BarChart2,
  '집합과 논리': GitBranch,
  '선형대수': Grid,
  '수열': List,
  '미분': Zap,
  '적분': Activity,
  '경우의 수와 확률': Shuffle,
  '통계': PieChart,
  '함수의 극한과 연속': ArrowRight,
  '수열의 극한': TrendingDown,
  '심화 미분': Zap,
  '심화 적분': Layers,
  '이차곡선': Circle,
  '벡터': ArrowRight,
  '공간도형': Box,
}

function getTier(topic) {
  const avg = (topic.min_diff + topic.max_diff) / 2
  if (avg <= 2) return 'basic'
  if (avg <= 3.5) return 'medium'
  return 'advanced'
}

function triggerConfetti() {
  const colors = ['#2563EB', '#38BDF8', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9']
  for (let i = 0; i < 48; i++) {
    const el = document.createElement('div')
    const angle = (i / 48) * 360
    const dist = 180 + Math.random() * 200
    const tx = Math.cos(angle * Math.PI / 180) * dist
    const ty = -Math.abs(Math.sin(angle * Math.PI / 180) * dist) - 80
    el.style.cssText = `
      position:fixed;top:50%;left:50%;width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};z-index:9999;pointer-events:none;
      background:${colors[i % colors.length]};
      --tx:${tx}px;--ty:${ty}px;
      animation:confettiPop 1s cubic-bezier(0,0.3,0.4,1) forwards;
    `
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1100)
  }
}

export default function StudyPage() {
  const navigate = useNavigate()
  const { student, currentProblems = [], currentProblemIndex = 0, sessionStats = { correct: 0, total: 0, xpEarned: 0 }, startSession, submitAttempt, nextProblem, endSession } = useStore()

  // Phase: 'topic' | 'study' | 'done'
  const [phase, setPhase] = useState('topic')
  const [selectedGrade, setSelectedGrade] = useState(student?.grade_level || '중3')
  const [showGradeMenu, setShowGradeMenu] = useState(false)
  const [topics, setTopics] = useState([])
  const [grouped, setGrouped] = useState({})
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [starting, setStarting] = useState(false)
  const [topicSearch, setTopicSearch] = useState('')
  const [topicStats, setTopicStats] = useState({}) // keyed by topic name

  // Study state
  const [selectedOption, setSelectedOption] = useState(null)   // index 0-3
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [shakingOption, setShakingOption] = useState(null)
  const [explanation, setExplanation] = useState('')
  const [explanationLoading, setExplanationLoading] = useState(false)
  const [xpPopup, setXpPopup] = useState(null)

  // Chat assistant
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const [practiceSplitOpen, setPracticeSplitOpen] = useState(false)
  const [chatPracticeLoading, setChatPracticeLoading] = useState(false)
  const [chatPracticeError, setChatPracticeError] = useState('')
  const [chatPracticeQuestions, setChatPracticeQuestions] = useState([])
  const [chatPracticeReveal, setChatPracticeReveal] = useState(new Set())

  // Bookmarks
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())

  const currentProblem = currentProblems[currentProblemIndex]
  const gradeInfo = GRADE_INFO[selectedGrade] || { color: 'var(--primary)', bg: 'var(--primary-light)' }

  // Load topics when grade changes
  useEffect(() => {
    setTopicsLoading(true)
    setTopics([])
    setGrouped({})
    setSelectedCategory(null)
    Promise.all([
      api.get('/problems/topics', { params: { grade: selectedGrade } }),
      api.get('/problems/topic-stats')
    ]).then(([topicsRes, statsRes]) => {
      setTopics(topicsRes.data.topics || [])
      setGrouped(topicsRes.data.grouped || {})
      const map = {}
      for (const s of statsRes.data.stats || []) {
        map[s.topic] = s
      }
      setTopicStats(map)
    }).catch(console.error).finally(() => setTopicsLoading(false))
  }, [selectedGrade])

  // Load bookmarks once
  useEffect(() => {
    api.get('/bookmarks/ids')
      .then(r => setBookmarkedIds(new Set(r.data.ids || [])))
      .catch(() => {})
  }, [])

  // Scroll chat on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSelectTopic = async (topic) => {
    setSelectedTopic(topic)
    setStarting(true)
    try {
      const res = await api.get('/problems/due', {
        params: { grade: selectedGrade, topic: topic.topic, limit: 15 }
      })
      let problems = res.data.problems || []
      if (!problems.length) {
        const fb = await api.get('/problems', { params: { grade: selectedGrade } })
        problems = (fb.data.problems || []).filter(p => p.topic === topic.topic).slice(0, 15)
      }
      if (!problems.length) { setStarting(false); return }
      if (typeof startSession === 'function') await startSession(problems)
      setPhase('study')
      resetStudyState()
    } catch (err) { console.error(err) }
    finally { setStarting(false) }
  }

  // Start study with a specific topic + optional difficulty filter
  const startStudy = async (topicObj, difficultyKey) => {
    setSelectedTopic(topicObj)
    setStarting(true)
    try {
      const params = {
        grade: selectedGrade,
        topic: topicObj.topic,
        curriculum: topicObj.curriculum,
        limit: 15,
      }
      if (difficultyKey) params.difficulty = difficultyKey
      const res = await api.get('/problems/due', { params })
      let problems = res.data.problems || []
      if (!problems.length) {
        // Fallback: fetch all and filter client-side
        const fb = await api.get('/problems', {
          params: { grade: selectedGrade, curriculum: topicObj.curriculum }
        })
        let all = (fb.data.problems || []).filter(p => p.topic === topicObj.topic)
        if (difficultyKey === 'basic') all = all.filter(p => p.difficulty <= 2)
        else if (difficultyKey === 'medium') all = all.filter(p => p.difficulty === 3)
        else if (difficultyKey === 'advanced') all = all.filter(p => p.difficulty >= 4)
        problems = all.slice(0, 15)
      }
      if (!problems.length) { setStarting(false); return }
      if (typeof startSession === 'function') await startSession(problems)
      setPhase('study')
      resetStudyState()
    } catch (err) { console.error(err) }
    finally { setStarting(false) }
  }

  const resetStudyState = () => {
    setSelectedOption(null)
    setIsAnswered(false)
    setIsCorrect(false)
    setExplanation('')
    setExplanationLoading(false)
    setChatMessages([])
    setChatInput('')
    setShakingOption(null)
    setPracticeSplitOpen(false)
    setChatPracticeLoading(false)
    setChatPracticeError('')
    setChatPracticeQuestions([])
    setChatPracticeReveal(new Set())
  }

  const lastChatUserQuestion = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i]?.role === 'user') return chatMessages[i].content
    }
    return ''
  })()

  const lastChatAssistantAnswer = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i]?.role === 'assistant') return chatMessages[i].content
    }
    return ''
  })()

  const lastAssistantIndex = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i]?.role === 'assistant') return i
    }
    return -1
  })()

  // Debug: why "Generate Practice Test" button isn't rendering
  useEffect(() => {
    try {
      const lastRole = chatMessages[chatMessages.length - 1]?.role
      const shouldShow =
        !practiceSplitOpen &&
        !chatLoading &&
        lastAssistantIndex !== -1 &&
        lastRole === 'assistant'

      console.log('[PracticeTestButton]', {
        chatLoading,
        practiceSplitOpen,
        chatMessagesLen: chatMessages.length,
        lastRole,
        lastAssistantIndex,
        shouldShow,
      })
    } catch (e) {
      console.log('[PracticeTestButton] debug error', e)
    }
  }, [chatLoading, practiceSplitOpen, chatMessages.length, lastAssistantIndex])

  const toggleChatPracticeReveal = (idx) => {
    setChatPracticeReveal(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const generateChatPractice = async () => {
    if (!currentProblem || chatPracticeLoading) return
    setChatPracticeLoading(true)
    setChatPracticeError('')
    try {
      const r = await api.post(`/study/${currentProblem.id}/chat-practice`, {
        userQuestion: lastChatUserQuestion,
        assistantAnswer: lastChatAssistantAnswer,
        count: 5,
      })
      setChatPracticeQuestions(r.data.questions || [])
      setChatPracticeReveal(new Set())
      setPracticeSplitOpen(true)
    } catch {
      setChatPracticeQuestions([])
      setChatPracticeError('연습 테스트를 생성하지 못했어요. 잠시 후 다시 시도해주세요.')
      setPracticeSplitOpen(true)
    } finally {
      setChatPracticeLoading(false)
    }
  }

  const handleAnswer = async (optionIdx) => {
    if (isAnswered || !currentProblem) return
    const correct = optionIdx === currentProblem.correct_option_index
    setSelectedOption(optionIdx)
    setIsAnswered(true)
    setIsCorrect(correct)

    if (correct) {
      playCorrectSound()
      triggerConfetti()
    } else {
      playWrongSound()
      setShakingOption(optionIdx)
      setTimeout(() => setShakingOption(null), 600)
    }

    // Submit attempt to backend
    try {
      const result = await submitAttempt(currentProblem.id, correct ? '맞음' : '틀림', 0, 0, [])
      if (result?.xpEarned > 0) {
        setXpPopup(result.xpEarned)
        playXPSound()
        setTimeout(() => setXpPopup(null), 2500)
      }
    } catch {}

    // Auto-fetch AI explanation
    setExplanationLoading(true)
    try {
      const r = await api.post(`/study/${currentProblem.id}/explain`, {
        isCorrect: correct,
        selectedOptionText: currentProblem.mc_options?.[optionIdx] || ''
      })
      setExplanation(r.data.explanation || '')
    } catch { setExplanation('') }
    finally { setExplanationLoading(false) }
  }

  const handleNext = () => {
    if (typeof nextProblem === 'function') nextProblem()
    resetStudyState()
    if (currentProblemIndex + 1 >= currentProblems.length) setPhase('done')
  }

  const handleEndSession = async () => {
    if (typeof endSession === 'function') await endSession()
    setPhase('topic')
    setSelectedTopic(null)
    resetStudyState()
  }

  const toggleBookmark = async (problemId) => {
    try {
      const r = await api.post(`/bookmarks/${problemId}`)
      setBookmarkedIds(prev => {
        const next = new Set(prev)
        r.data.bookmarked ? next.add(problemId) : next.delete(problemId)
        return next
      })
    } catch {}
  }

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading || !currentProblem) return
    const userMsg = { role: 'user', content: text }
    setChatMessages(m => [...m, userMsg])
    setChatInput('')
    setChatLoading(true)
    try {
      const history = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const r = await api.post(`/study/${currentProblem.id}/ask`, { messages: history })
      setChatMessages(m => [...m, { role: 'assistant', content: r.data.reply }])
    } catch {
      setChatMessages(m => [...m, { role: 'assistant', content: '잠시 문제가 생겼어요. 다시 시도해주세요.' }])
    } finally { setChatLoading(false) }
  }

  const ALL_GRADES = ['중1', '중2', '중3', '고1', '고2', '고3']

  /* ══════════ TOPIC SELECTION ══════════ */
  if (phase === 'topic') {
    // Categories for this grade, derived from grouped data
    const categoryNames = Object.keys(grouped)
    const activeCategory = selectedCategory && grouped[selectedCategory] ? selectedCategory : (categoryNames[0] || null)
    const subcategories = activeCategory ? (grouped[activeCategory] || []) : []
    const filteredSubs = topicSearch
      ? subcategories.filter(t => t.topic.toLowerCase().includes(topicSearch.toLowerCase()))
      : subcategories

    return (
      <div style={{ background: '#f8f9fa', minHeight: '100vh', padding: '28px 24px 80px' }}>
        <div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 2 }}>단원 선택</h1>
              <p style={{ color: GREY, fontSize: 13 }}>학년과 단원을 선택한 뒤 난이도를 클릭하면 바로 시작됩니다</p>
            </div>
          </div>

          {/* Grade pills row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {ALL_GRADES.map(g => {
              const gi = GRADE_INFO[g] || {}
              const isActive = g === selectedGrade
              return (
                <button
                  key={g}
                  onClick={() => { setSelectedGrade(g); setSelectedCategory(null) }}
                  style={{
                    padding: '8px 18px', borderRadius: 20,
                    border: isActive ? `2px solid ${gi.color}` : '2px solid #e5e7eb',
                    background: isActive ? gi.bg : '#fff',
                    color: isActive ? gi.color : GREY,
                    fontWeight: isActive ? 800 : 600, fontSize: 14,
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = gi.color; e.currentTarget.style.color = gi.color } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = GREY } }}
                >
                  {g}
                </button>
              )
            })}
          </div>

          {topicsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="skeleton" style={{ height: 90, borderRadius: 14 }} />
              ))}
            </div>
          ) : topics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 56, background: '#fff', borderRadius: 16, border: '1px solid var(--border)', color: GREY }}>
              <BookOpen size={40} color={GREY} strokeWidth={1.25} style={{ margin: '0 auto 12px', display: 'block' }} />
              <p>이 학년에 문제가 없습니다</p>
            </div>
          ) : (
            <>
              {/* Category cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                {categoryNames.map((catName, ci) => {
                  const catTopics = grouped[catName] || []
                  const totalCount = catTopics.reduce((s, t) => s + t.total_count, 0)
                  const isActive = catName === activeCategory
                  const IconComp = CATEGORY_ICONS[catName] || Hash
                  return (
                    <button
                      key={catName}
                      onClick={() => setSelectedCategory(catName)}
                      style={{
                        background: isActive ? gradeInfo.bg : '#fff',
                        border: isActive ? `2px solid ${gradeInfo.color}` : '1.5px solid #e5e7eb',
                        borderRadius: 14, padding: '16px 18px',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.18s',
                        boxShadow: isActive ? `0 4px 16px ${gradeInfo.color}22` : '0 1px 4px rgba(0,0,0,0.04)',
                        animation: `topicIn 0.3s ease ${ci * 0.05}s both`
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = gradeInfo.color; e.currentTarget.style.boxShadow = `0 4px 12px ${gradeInfo.color}18` } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: isActive ? gradeInfo.color : '#f3f4f6',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <IconComp size={17} color={isActive ? '#fff' : GREY} strokeWidth={1.75} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isActive ? gradeInfo.color : 'var(--text)', lineHeight: 1.3 }}>{catName}</div>
                          <div style={{ fontSize: 11, color: GREY }}>{catTopics.length}단원</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: isActive ? gradeInfo.color : GREY, fontWeight: 600 }}>
                        {totalCount}문제
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Subcategory list */}
              {activeCategory && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', animation: 'topicIn 0.2s ease' }}>
                  {/* Panel header */}
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {(() => { const IC = CATEGORY_ICONS[activeCategory] || Hash; return <IC size={16} color={gradeInfo.color} strokeWidth={2} /> })()}
                      <span style={{ fontWeight: 800, fontSize: 15, color: gradeInfo.color }}>{activeCategory}</span>
                      <span style={{ fontSize: 12, color: GREY }}>{filteredSubs.length}개 단원</span>
                    </div>
                    {/* Search within category */}
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="단원 검색..."
                        value={topicSearch}
                        onChange={e => setTopicSearch(e.target.value)}
                        style={{
                          height: 34, paddingLeft: 32, paddingRight: 12, width: 180,
                          background: '#f8f9fa', border: '1.5px solid #e5e7eb',
                          borderRadius: 8, fontSize: 13, outline: 'none', transition: 'border-color 0.15s'
                        }}
                        onFocus={e => e.target.style.borderColor = gradeInfo.color}
                        onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                      />
                      <AlertCircle size={13} color={GREY} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  {/* Subcategory rows */}
                  <div>
                    {filteredSubs.length === 0 ? (
                      <div style={{ padding: '28px', textAlign: 'center', color: GREY, fontSize: 13 }}>
                        검색 결과가 없습니다
                      </div>
                    ) : filteredSubs.map((t, ti) => {
                      const stats = topicStats[t.topic]
                      const hasStudied = stats && stats.total_attempts > 0
                      const accuracy = hasStudied ? stats.accuracy : null
                      const isWeak = hasStudied && accuracy < 50
                      return (
                        <div
                          key={`${t.topic}-${ti}`}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 20px', gap: 12, flexWrap: 'wrap',
                            borderBottom: ti < filteredSubs.length - 1 ? '1px solid #f1f5f9' : 'none',
                            animation: `topicIn 0.25s ease ${ti * 0.03}s both`
                          }}
                        >
                          {/* Left: topic name + stats */}
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{t.topic}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: GREY }}>{t.total_count}문제</span>
                              {hasStudied ? (
                                <span style={{
                                  fontSize: 11, fontWeight: 700,
                                  color: isWeak ? '#dc2626' : accuracy >= 80 ? '#059669' : '#d97706'
                                }}>
                                  정답률 {accuracy}%{accuracy >= 80 ? ' ✓' : ''}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#c0c8d0' }}>미학습</span>
                              )}
                            </div>
                          </div>

                          {/* Right: difficulty pills + start buttons */}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {DIFFICULTY_PILLS.map(pill => (
                              <button
                                key={pill.key || 'all'}
                                onClick={() => !starting && startStudy(t, pill.key)}
                                disabled={starting}
                                title={pill.key ? `${pill.label} 난이도로 시작` : '전체 문제로 시작'}
                                style={{
                                  padding: '6px 13px', borderRadius: 20,
                                  border: `1.5px solid ${pill.border}`,
                                  background: pill.bg,
                                  color: pill.color,
                                  fontWeight: 700, fontSize: 12,
                                  cursor: starting ? 'wait' : 'pointer',
                                  transition: 'all 0.15s',
                                  opacity: starting ? 0.6 : 1
                                }}
                                onMouseEnter={e => { if (!starting) { e.currentTarget.style.background = pill.color; e.currentTarget.style.color = '#fff' } }}
                                onMouseLeave={e => { if (!starting) { e.currentTarget.style.background = pill.bg; e.currentTarget.style.color = pill.color } }}
                              >
                                {pill.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <style>{`
          @keyframes topicIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        `}</style>
      </div>
    )
  }

  /* ══════════ DONE ══════════ */
  if (phase === 'done' || (phase === 'study' && currentProblemIndex >= currentProblems.length)) {
    const accuracy = sessionStats.total > 0 ? Math.round(sessionStats.correct / sessionStats.total * 100) : 0
    return (
      <div style={{ background: '#f8f9fa', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: '48px 40px', textAlign: 'center', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', animation: 'scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            {accuracy >= 70 ? <CheckCircle size={40} color="#fff" strokeWidth={1.75} /> : <Target size={40} color="#fff" strokeWidth={1.75} />}
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>
            {accuracy >= 70 ? '훌륭해요!' : '계속 연습해요!'}
          </h2>
          <p style={{ color: GREY, marginBottom: 32, fontSize: 15 }}>{selectedTopic?.topic} 단원 완료</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
            {[
              { label: '총 문제', value: sessionStats.total, Icon: BookOpen, color: 'var(--primary)' },
              { label: '정답', value: `${accuracy}%`, Icon: CheckCircle, color: 'var(--success)' },
              { label: '획득 XP', value: `+${sessionStats.xpEarned}`, Icon: Zap, color: '#f59e0b' }
            ].map(s => (
              <div key={s.label} style={{ background: '#f8f9fa', borderRadius: 14, padding: '16px 10px' }}>
                <s.Icon size={20} color={s.color} strokeWidth={1.75} style={{ margin: '0 auto 6px', display: 'block' }} />
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: GREY }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleEndSession} style={{ flex: 1, height: 48, background: '#f3f4f6', color: 'var(--text)', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
            ><RotateCcw size={14} strokeWidth={2} /> 다른 단원</button>
            <button onClick={() => { handleEndSession(); setTimeout(() => navigate('/progress'), 80) }} style={{ flex: 1, height: 48, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >분석 보기</button>
          </div>
        </div>
      </div>
    )
  }

  /* ══════════ STUDY MODE ══════════ */
  if (!currentProblem) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8f9fa' }}>
      <div style={{ textAlign: 'center', color: '#6B7280' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>문제를 불러오는 중...</div>
        <button onClick={() => setPhase('topic')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          단원 선택으로 돌아가기
        </button>
      </div>
    </div>
  )
  const progress = ((currentProblemIndex) / currentProblems.length) * 100
  const isBookmarked = bookmarkedIds.has(currentProblem.id)
  const options = currentProblem.mc_options || []

  return (
    <div style={{ background: '#f8f9fa', minHeight: '100vh', padding: '20px 20px 60px' }}>
      {/* XP popup */}
      {xpPopup && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 500,
          background: 'var(--primary)',
          color: '#fff', padding: '10px 22px', borderRadius: 24,
          fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', gap: 6,
          animation: 'xpFloat 2.5s ease forwards', boxShadow: '0 8px 28px rgba(26,86,219,0.4)'
        }}>
          <Zap size={16} color="#fbbf24" strokeWidth={2} /> +{xpPopup} XP
        </div>
      )}

      <div>
        {/* Top bar: breadcrumb + progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
            <button onClick={() => setPhase('topic')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREY, fontSize: 13, padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.color = GREY}
            ><ChevronLeft size={13} strokeWidth={2.5} /> 단원 선택</button>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ fontWeight: 700, color: gradeInfo.color }}>{selectedGrade}</span>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedTopic?.topic}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: GREY, fontWeight: 600 }}>
              {currentProblemIndex + 1} / {currentProblems.length}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: `${gradeInfo.color}`, borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Main layout: 60/40 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

          {/* ── LEFT: Question + MC + Explanation ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Question card */}
            <div style={{
              background: '#fff', borderRadius: 18, border: '1.5px solid #e5e7eb',
              padding: '28px 28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              position: 'relative'
            }}>
              {/* Top row: tags + bookmark */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ background: gradeInfo.bg, color: gradeInfo.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{currentProblem.grade}</span>
                <span style={{ background: '#f3f4f6', color: GREY, padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>{currentProblem.topic}</span>
                {currentProblem.repetitions > 0 && <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>복습</span>}
                {/* Difficulty */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1,2,3,4].map(d => <div key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: d <= currentProblem.difficulty ? gradeInfo.color : '#e5e7eb' }} />)}
                  </div>
                  <span style={{ fontSize: 11, color: GREY }}>
                    {currentProblem.difficulty <= 2 ? '기초' : currentProblem.difficulty === 3 ? '보통' : '심화'}
                  </span>
                </div>
                {/* Bookmark */}
                <button
                  onClick={() => toggleBookmark(currentProblem.id)}
                  title={isBookmarked ? '북마크 해제' : '복습 목록에 저장'}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, transition: 'background 0.15s', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {isBookmarked
                    ? <BookmarkCheck size={20} color="var(--primary)" strokeWidth={2} />
                    : <Bookmark size={20} color={GREY} strokeWidth={1.75} />}
                </button>
              </div>

              {/* Question text */}
              <div style={{
                background: '#EFF6FF',
                borderRadius: 12, padding: '24px 28px',
                border: '1px solid #BFDBFE',
                fontSize: 20, lineHeight: 1.7
              }}>
                <MathText text={currentProblem.question_latex} />
              </div>
            </div>

            {/* MC Options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {options.map((option, idx) => {
                const isSelected = selectedOption === idx
                const isCorrectOption = idx === currentProblem.correct_option_index
                let borderColor = '#e5e7eb', background = '#fff', textColor = 'var(--text)'

                if (isAnswered) {
                  if (isCorrectOption) {
                    borderColor = 'var(--success)'; background = 'var(--success-light)'; textColor = 'var(--success)'
                  } else if (isSelected && !isCorrectOption) {
                    borderColor = 'var(--error)'; background = 'var(--error-light)'; textColor = 'var(--error)'
                  } else {
                    borderColor = '#e5e7eb'; background = '#fafafa'; textColor = '#9ca3af'
                  }
                } else if (isSelected) {
                  borderColor = gradeInfo.color; background = gradeInfo.bg; textColor = gradeInfo.color
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={isAnswered}
                    style={{
                      background, borderRadius: 14, border: `2px solid ${borderColor}`,
                      padding: '16px 18px', textAlign: 'left', cursor: isAnswered ? 'default' : 'pointer',
                      transition: 'all 0.18s',
                      animation: shakingOption === idx ? 'mcShake 0.5s cubic-bezier(0.36,0.07,0.19,0.97)' : 'none',
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      boxShadow: isAnswered ? 'none' : '0 1px 4px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={e => { if (!isAnswered) { e.currentTarget.style.borderColor = gradeInfo.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${gradeInfo.color}22` } }}
                    onMouseLeave={e => { if (!isAnswered) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)' } }}
                  >
                    {/* Letter badge */}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: isAnswered ? (isCorrectOption ? 'var(--success)' : isSelected ? 'var(--error)' : '#e5e7eb') : (isSelected ? gradeInfo.color : '#f3f4f6'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isAnswered && isCorrectOption
                        ? <CheckCircle size={15} color="#fff" strokeWidth={2.5} />
                        : isAnswered && isSelected && !isCorrectOption
                        ? <XCircle size={15} color="#fff" strokeWidth={2.5} />
                        : <span style={{ fontSize: 12, fontWeight: 800, color: isSelected && !isAnswered ? '#fff' : GREY }}>{OPTION_LABELS[idx]}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: isAnswered && isCorrectOption ? 700 : 500, color: textColor, lineHeight: 1.5 }}>
                      <MathText text={option} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* After answer: result banner */}
            {isAnswered && (
              <div style={{
                background: isCorrect ? 'var(--success-light)' : 'var(--error-light)',
                border: `1.5px solid ${isCorrect ? 'var(--success)' : 'var(--error)'}`,
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                animation: 'fadeIn 0.3s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isCorrect
                    ? <CheckCircle size={18} color="var(--success)" strokeWidth={2} />
                    : <XCircle size={18} color="var(--error)" strokeWidth={2} />}
                  <span style={{ fontWeight: 800, fontSize: 15, color: isCorrect ? 'var(--success)' : 'var(--error)' }}>
                    {isCorrect ? '정답! 완벽해요' : '오답 — 아래 AI 풀이를 확인해보세요'}
                  </span>
                </div>
                <button onClick={handleNext} style={{
                  background: 'var(--primary)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '8px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s'
                }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {currentProblemIndex + 1 >= currentProblems.length
                    ? <><Flag size={14} strokeWidth={2} /> 완료</>
                    : <>다음 문제 <ChevronRight size={14} strokeWidth={2.5} /></>}
                </button>
              </div>
            )}

            {/* AI Explanation panel */}
            {isAnswered && (
              <div style={{
                background: '#fff', borderRadius: 16, border: '1.5px solid #e0e7ff',
                overflow: 'hidden', animation: 'fadeIn 0.4s ease 0.1s both',
                boxShadow: '0 2px 12px rgba(26,86,219,0.07)'
              }}>
                <div style={{ background: 'var(--primary)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#fff" strokeWidth={1.75} />
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>AI 풀이 설명</span>
                </div>
                <div style={{ padding: '20px' }}>
                  {explanationLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: GREY, fontSize: 14 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: `dotB 1s ease infinite ${j*0.2}s` }} />)}
                      </div>
                      AI가 풀이를 작성 중이에요...
                    </div>
                  ) : explanation ? (
                    <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
                      {explanation.split('\n').map((line, i) => {
                        if (!line.trim()) return <div key={i} style={{ height: 8 }} />
                        const isStep = /^\d+단계:|^핵심 포인트:/.test(line)
                        return (
                          <div key={i} style={{ marginBottom: isStep ? 6 : 2, fontWeight: isStep ? 700 : 500, color: isStep ? 'var(--primary)' : 'var(--text-secondary)' }}>
                            <MathText text={line} />
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ color: GREY, fontSize: 13 }}>설명을 불러올 수 없습니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: AI Question Assistant ── */}
          <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', height: 480 }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={15} color="#fff" strokeWidth={1.75} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>질문 도우미 수학이</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>이 문제에 대해 물어보세요</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                {!practiceSplitOpen ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: GREY, fontSize: 13, padding: '20px 10px' }}>
                        <Sparkles size={28} color="var(--primary)" strokeWidth={1.25} style={{ margin: '0 auto 8px', display: 'block' }} />
                        <p style={{ marginBottom: 12 }}>이 문제에 대해 궁금한 것이 있으면 물어보세요.</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                          {['어떻게 시작하나요?', '핵심 공식이 뭔가요?', '힌트 주세요'].map(q => (
                            <button key={q} onClick={() => { setChatInput(q); chatInputRef.current?.focus() }} style={{
                              padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              background: 'var(--primary-light)', color: 'var(--primary)',
                              border: '1px solid #bfdbfe', cursor: 'pointer'
                            }}>{q}</button>
                          ))}
                        </div>
                      </div>
                    ) : chatMessages.map((m, i) => (
                      <React.Fragment key={i}>
                        <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                          {m.role === 'assistant' && (
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Sparkles size={11} color="#fff" strokeWidth={2} />
                            </div>
                          )}
                          <div style={{
                            maxWidth: '82%', padding: '9px 12px',
                            borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                            background: m.role === 'user' ? 'var(--primary)' : '#f3f4f6',
                            color: m.role === 'user' ? '#fff' : 'var(--text)',
                            fontSize: 13, lineHeight: 1.7,
                            boxShadow: m.role === 'user' ? '0 2px 6px rgba(26,86,219,0.25)' : 'none'
                          }}>
                            <MathText text={m.content} />
                          </div>
                        </div>

                        {/* Generate Practice Test button directly under last assistant message */}
                        {!practiceSplitOpen && !chatLoading && i === lastAssistantIndex && (
                          <button
                            onClick={generateChatPractice}
                            disabled={chatPracticeLoading}
                            style={{
                              marginTop: 4,
                              width: '100%',
                              height: 40,
                              borderRadius: 12,
                              border: '1.5px solid #bfdbfe',
                              background: chatPracticeLoading ? '#f3f4f6' : 'var(--primary-light)',
                              color: chatPracticeLoading ? GREY : 'var(--primary)',
                              fontWeight: 900,
                              fontSize: 13,
                              cursor: chatPracticeLoading ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                          >
                            <Target size={14} strokeWidth={2.2} />
                            Generate Practice Test
                          </button>
                        )}
                      </React.Fragment>
                    ))}

                    {chatLoading && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Sparkles size={11} color="#fff" strokeWidth={2} />
                        </div>
                        <div style={{ background: '#f3f4f6', padding: '10px 14px', borderRadius: '14px 14px 14px 3px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[0,1,2].map(j => <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', animation: `dotB 1s ease infinite ${j*0.2}s` }} />)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Debug line (temporary) */}
                    <div style={{ marginTop: 2, fontSize: 10, color: '#9ca3af', fontWeight: 700 }}>
                      debug: chatLoading={String(chatLoading)} practiceSplitOpen={String(practiceSplitOpen)} lastRole={String(chatMessages[chatMessages.length - 1]?.role || '')} lastAssistantIndex={String(lastAssistantIndex)}
                    </div>

                    {/* Fallback: always show button once any assistant reply exists */}
                    {!practiceSplitOpen && !chatLoading && lastAssistantIndex !== -1 && (
                      <button
                        onClick={generateChatPractice}
                        disabled={chatPracticeLoading}
                        style={{
                          marginTop: 6,
                          width: '100%',
                          height: 40,
                          borderRadius: 12,
                          border: '1.5px solid #bfdbfe',
                          background: chatPracticeLoading ? '#f3f4f6' : 'var(--primary-light)',
                          color: chatPracticeLoading ? GREY : 'var(--primary)',
                          fontWeight: 900,
                          fontSize: 13,
                          cursor: chatPracticeLoading ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Target size={14} strokeWidth={2.2} />
                        Generate Practice Test
                      </button>
                    )}

                    <div ref={chatEndRef} />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                    {/* Left: chat */}
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text)' }}>Chat</div>
                        <button
                          onClick={() => setPracticeSplitOpen(false)}
                          style={{
                            height: 28,
                            padding: '0 10px',
                            borderRadius: 10,
                            border: '1.5px solid #e5e7eb',
                            background: '#fff',
                            color: GREY,
                            fontWeight: 900,
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          Close
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {chatMessages.map((m, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                            {m.role === 'assistant' && (
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Sparkles size={10} color="#fff" strokeWidth={2} />
                              </div>
                            )}
                            <div style={{
                              maxWidth: '92%', padding: '9px 12px',
                              borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                              background: m.role === 'user' ? 'var(--primary)' : '#f3f4f6',
                              color: m.role === 'user' ? '#fff' : 'var(--text)',
                              fontSize: 13, lineHeight: 1.7,
                            }}>
                              <MathText text={m.content} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: practice */}
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text)' }}>Practice Test</div>

                      {chatPracticeLoading && (
                        <div style={{ fontSize: 12, color: GREY, fontWeight: 700 }}>
                          Generating practice test...
                        </div>
                      )}

                      {!!chatPracticeError && (
                        <div style={{ fontSize: 12, color: 'var(--error)', fontWeight: 800 }}>
                          {chatPracticeError}
                        </div>
                      )}

                      {!chatPracticeLoading && !chatPracticeError && Array.isArray(chatPracticeQuestions) && chatPracticeQuestions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {chatPracticeQuestions.map((q, idx) => {
                            const revealed = chatPracticeReveal.has(idx)
                            const isMcq = q.type === 'mcq'
                            return (
                              <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                  <div style={{ fontWeight: 900, fontSize: 12, color: 'var(--primary)' }}>Q{idx + 1} {isMcq ? '(MCQ)' : '(Short)'}</div>
                                  <button
                                    onClick={() => toggleChatPracticeReveal(idx)}
                                    style={{
                                      height: 28,
                                      padding: '0 10px',
                                      borderRadius: 10,
                                      border: '1.5px solid #e5e7eb',
                                      background: revealed ? 'var(--primary)' : '#f8fafc',
                                      color: revealed ? '#fff' : GREY,
                                      fontWeight: 900,
                                      fontSize: 12,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {revealed ? 'Hide Answer' : 'Reveal Answer'}
                                  </button>
                                </div>

                                <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)' }}>
                                  <MathText text={q.question_latex} />
                                </div>

                                {isMcq && Array.isArray(q.options) && q.options.length === 4 && (
                                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                                    {q.options.map((opt, oi) => (
                                      <div key={oi} style={{ padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', fontSize: 12 }}>
                                        <span style={{ fontWeight: 900, color: GREY, marginRight: 6 }}>{OPTION_LABELS[oi]}</span>
                                        <MathText text={opt} />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {revealed && (
                                  <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--primary-light)', border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--primary)', marginBottom: 4 }}>Answer</div>
                                    <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--primary)' }}>
                                      <MathText text={q.answer_latex} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="이 문제에 대해 질문하세요..."
                  disabled={chatLoading}
                  style={{
                    flex: 1, height: 38, padding: '0 12px',
                    border: '1.5px solid var(--border)', borderRadius: 10,
                    fontSize: 12, outline: 'none',
                    background: chatLoading ? '#f9fafb' : '#fff',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{
                  width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
                  background: chatInput.trim() && !chatLoading ? 'var(--primary)' : '#f3f4f6',
                  cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                }}>
                  <Send size={14} color={chatInput.trim() && !chatLoading ? '#fff' : GREY} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Session stats mini card */}
            <div style={{ marginTop: 14, background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '14px 18px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--success)' }}>{sessionStats.correct}</div>
                <div style={{ fontSize: 11, color: GREY }}>정답</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--error)' }}>{sessionStats.wrong}</div>
                <div style={{ fontSize: 11, color: GREY }}>오답</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Zap size={16} color="#f59e0b" strokeWidth={2} />{sessionStats.xpEarned}
                </div>
                <div style={{ fontSize: 11, color: GREY }}>XP</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mcShake {
          10%,90%{transform:translateX(-3px)} 20%,80%{transform:translateX(4px)}
          30%,50%,70%{transform:translateX(-5px)} 40%,60%{transform:translateX(5px)}
        }
        @keyframes xpFloat {
          0%{opacity:0;transform:translateY(20px)} 15%{opacity:1;transform:translateY(0)}
          75%{opacity:1;transform:translateY(-18px)} 100%{opacity:0;transform:translateY(-32px)}
        }
        @keyframes confettiPop {
          0%{transform:translate(-50%,-50%) scale(0) rotate(0deg);opacity:1}
          100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(1) rotate(360deg);opacity:0}
        }
        @keyframes dotB {
          0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-6px);opacity:1}
        }
        @media (max-width:900px) {
          .study-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
