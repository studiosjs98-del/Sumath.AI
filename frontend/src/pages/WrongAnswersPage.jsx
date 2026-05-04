import React, { useEffect, useState } from 'react'
import { CheckCircle, ChevronDown, Filter, RotateCcw, Award, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../utils/api'
import { MathText } from '../components/MathRenderer'

const DIFF_BADGE = {
  1: { label: '기초', bg: '#EFF6FF', color: '#2563EB' },
  2: { label: '기초', bg: '#EFF6FF', color: '#2563EB' },
  3: { label: '보통', bg: '#FFFBEB', color: '#D97706' },
  4: { label: '심화', bg: '#FFF7ED', color: '#EA580C' },
}

const GREY = '#6B7280'

export default function WrongAnswersPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [filter, setFilter] = useState({ grade: '', curriculum: '' })

  useEffect(() => {
    api.get('/progress/wrong-answers')
      .then(r => setItems(r.data.problems || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const grades = [...new Set(items.map(i => i.grade))].sort()
  const curricula = [...new Set(items.map(i => i.curriculum))].sort()

  const filtered = items.filter(i =>
    (!filter.grade || i.grade === filter.grade) &&
    (!filter.curriculum || i.curriculum === filter.curriculum)
  )

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <div style={{ textAlign: 'center', color: GREY }}>
        <RotateCcw size={32} color={GREY} strokeWidth={1.5} style={{ margin: '0 auto 12px', display: 'block' }} />
        <div>오답 노트 불러오는 중...</div>
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-gray)', minHeight: '100vh', padding: '32px 24px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>오답 노트</h1>
          <p style={{ color: GREY }}>틀린 문제를 다시 풀어보고 완전히 이해하세요</p>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} color={GREY} strokeWidth={1.75} />
          <select
            value={filter.grade}
            onChange={e => setFilter(f => ({ ...f, grade: e.target.value }))}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, background: '#fff', cursor: 'pointer' }}
          >
            <option value="">전체 학년</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={filter.curriculum}
            onChange={e => setFilter(f => ({ ...f, curriculum: e.target.value }))}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, background: '#fff', cursor: 'pointer' }}
          >
            <option value="">전체 과목</option>
            {curricula.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filter.grade || filter.curriculum) && (
            <button
              onClick={() => setFilter({ grade: '', curriculum: '' })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, background: '#fff', cursor: 'pointer', color: 'var(--error)' }}
            >
              초기화
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 14, color: GREY }}>
            {filtered.length}개 문제
          </span>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 'var(--radius-lg)', padding: '64px 32px',
            textAlign: 'center', border: '1px solid var(--border)'
          }}>
            <Award size={48} color={GREY} strokeWidth={1.5} style={{ margin: '0 auto 16px', display: 'block' }} />
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>오답이 없습니다</h3>
            <p style={{ color: GREY, marginBottom: filter.grade || filter.curriculum ? 0 : 24 }}>
              {filter.grade || filter.curriculum
                ? '선택한 필터에 해당하는 오답이 없습니다.'
                : '실력이 뛰어나거나 아직 문제를 풀지 않았어요. 문제를 풀수록 약점이 분석됩니다!'}
            </p>
            {!filter.grade && !filter.curriculum && (
              <Link to="/study" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--primary)', color: '#fff',
                padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                textDecoration: 'none', marginTop: 4
              }}>
                <BookOpen size={15} strokeWidth={2} /> 문제 풀러 가기
              </Link>
            )}
          </div>
        )}

        {/* Problem cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map(item => (
            <div key={item.id} style={{
              background: '#fff', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)', overflow: 'hidden',
              boxShadow: 'var(--shadow)'
            }}>
              <div
                style={{
                  padding: '20px 24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 16
                }}
                onClick={() => toggle(item.id)}
              >
                {/* Badge */}
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <span style={{
                    background: 'var(--error-light)', color: 'var(--error)',
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20
                  }}>오답</span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{item.grade}</span>
                    <span style={{ background: 'var(--bg-gray)', color: GREY, fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>{item.curriculum}</span>
                    <span style={{ background: 'var(--bg-gray)', color: GREY, fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>{item.topic}</span>
                    {item.difficulty && (() => {
                      const d = DIFF_BADGE[item.difficulty] || DIFF_BADGE[1]
                      return (
                        <span style={{ background: d.bg, color: d.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                          {d.label}
                        </span>
                      )
                    })()}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6 }}>
                    <MathText text={item.question_latex} />
                  </div>
                </div>

                <div style={{
                  color: GREY, flexShrink: 0,
                  transition: 'transform 0.2s',
                  transform: expanded[item.id] ? 'rotate(180deg)' : 'none',
                  display: 'flex', alignItems: 'center'
                }}>
                  <ChevronDown size={18} color={GREY} strokeWidth={1.75} />
                </div>
              </div>

              {/* Expanded solution */}
              {expanded[item.id] && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '24px', background: 'var(--bg-gray)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Answer */}
                    <div>
                      <h4 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--success)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={14} color="var(--success)" strokeWidth={2} /> 정답
                      </h4>
                      <div style={{ background: 'var(--success-light)', borderRadius: 8, padding: '12px 16px', fontSize: 15, fontWeight: 600 }}>
                        <MathText text={item.answer_latex} />
                      </div>
                    </div>

                    {/* Solution steps */}
                    <div>
                      <h4 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--primary)', fontSize: 14 }}>풀이 단계</h4>
                      <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(() => {
                          try {
                            const steps = typeof item.solution_steps === 'string' ? JSON.parse(item.solution_steps) : item.solution_steps
                            return steps.map((s, i) => (
                              <li key={i} style={{
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                background: '#fff', borderRadius: 6, padding: '8px 12px',
                                border: '1px solid var(--border)', fontSize: 14
                              }}>
                                <span style={{
                                  background: 'var(--primary)', color: '#fff',
                                  width: 20, height: 20, borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1
                                }}>{i + 1}</span>
                                <MathText text={s} />
                              </li>
                            ))
                          } catch { return null }
                        })()}
                      </ol>
                    </div>
                  </div>

                  {/* Hints */}
                  <div style={{ marginTop: 20 }}>
                    <h4 style={{ fontWeight: 700, marginBottom: 12, color: GREY, fontSize: 14 }}>핵심 힌트</h4>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(() => {
                        try {
                          const hints = typeof item.hints === 'string' ? JSON.parse(item.hints) : item.hints
                          return hints.map((h, i) => (
                            <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: GREY, border: '1px solid var(--border)' }}>
                              {h}
                            </div>
                          ))
                        } catch { return null }
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
    </div>
  )
}
