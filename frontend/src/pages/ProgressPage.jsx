import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Calendar, Trophy, TrendingUp, ChevronRight } from 'lucide-react'
import useStore from '../store/useStore'
import api from '../utils/api'
import XPBar from '../components/XPBar'
import StreakBadge from '../components/StreakBadge'

const GREY = '#6B7280'

export default function ProgressPage() {
  const { student } = useStore()
  const [sessions, setSessions] = useState([])
  const [overview, setOverview] = useState(null)
  const [rankInfo, setRankInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/progress/sessions'),
      api.get('/progress/overview'),
      api.get('/ranking/me').catch(() => null),
    ]).then(([sRes, ov, rk]) => {
      setSessions(sRes.data.sessions || [])
      setOverview(ov.data)
      if (rk) setRankInfo(rk.data)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '32px 24px' }}>
      {[1,2,3].map(i => <div key={i} style={{ height: 100, background: 'var(--bg-gray)', borderRadius: 12, marginBottom: 16 }} />)}
    </div>
  )

  const stats = overview?.stats || {}

  return (
    <div style={{ background: 'var(--bg-gray)', minHeight: '100vh', padding: '32px 24px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart2 size={26} color={GREY} strokeWidth={1.75} /> 진도 현황
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>나의 학습 기록과 전체 랭킹을 확인하세요</p>

        {/* Student summary card */}
        <div style={{
          background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
          borderRadius: 'var(--radius-xl)', padding: '24px 28px', marginBottom: 24,
          color: '#fff', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap'
        }}>
          <StreakBadge streak={student?.streak_days || 0} size="md" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {student?.display_name} · {student?.grade_level} · {student?.rank}
            </div>
            <XPBar student={student} />
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: '총 풀이', value: stats.totalAttempts || 0 },
              { label: '정확도', value: `${stats.accuracy || 0}%` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{s.value}</div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking preview */}
        {rankInfo && (
          <div style={{
            background: '#fff', borderRadius: 'var(--radius-lg)', padding: '20px 24px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)', marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy size={16} color={GREY} strokeWidth={1.75} /> 나의 전국 랭킹
              </h3>
              <Link to="/ranking" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                전체 랭킹 보기 <ChevronRight size={13} strokeWidth={2} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {[
                { label: '전체 순위', value: `${rankInfo.rank}위`, sub: `/ ${rankInfo.total}명` },
                { label: '상위 %', value: `상위 ${rankInfo.percentile}%`, color: '#f59e0b' },
                { label: '총 XP', value: (student?.xp || 0).toLocaleString(), sub: 'XP' },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'var(--bg-gray)', borderRadius: 10, padding: '14px',
                  border: '1px solid var(--border)', textAlign: 'center'
                }}>
                  <div style={{ fontSize: 11, color: GREY, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: s.color || 'var(--primary)', lineHeight: 1 }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session history */}
        {sessions.length > 0 ? (
          <div style={{
            background: '#fff', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow)'
          }}>
            <div style={{
              padding: '16px 22px', borderBottom: '1px solid var(--border)',
              fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Calendar size={14} color={GREY} strokeWidth={1.75} /> 학습 기록
            </div>
            {sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 22px',
                borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                background: i % 2 === 0 ? '#fff' : 'var(--bg-gray)'
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {new Date(s.started_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {s.problems_attempted}문제 · {s.problems_correct}정답
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 700, fontSize: 16,
                      color: (s.accuracy || 0) >= 70 ? 'var(--success)' : 'var(--error)'
                    }}>
                      {s.accuracy || 0}%
                    </div>
                    <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>+{s.xp_earned} XP</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center', padding: 56, color: 'var(--text-muted)', fontSize: 14,
            border: '2px dashed var(--border)', borderRadius: 'var(--radius-xl)'
          }}>
            <BarChart2 size={48} color={GREY} strokeWidth={1.25} style={{ margin: '0 auto 12px', display: 'block' }} />
            아직 학습 기록이 없어요. 학습을 시작하면 기록이 쌓여요!
          </div>
        )}
    </div>
  )
}
