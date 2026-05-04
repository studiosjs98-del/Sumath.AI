import React, { useEffect, useState } from 'react'
import { Trophy, Crown, Medal, TrendingUp, Users, Zap, Target, Flame, ChevronUp, ChevronDown, Minus } from 'lucide-react'
import api from '../utils/api'
import useStore from '../store/useStore'

const GREY = '#6B7280'

const RANK_COLORS = {
  '9급': '#94A3B8','8급': '#94A3B8','7급': '#94A3B8','6급': '#38BDF8','5급': '#2563EB',
  '4급': '#2563EB','3급': '#1D4ED8','2급': '#1D4ED8','1급': '#0EA5E9',
  '초단': '#F59E0B','1단': '#F59E0B','2단': '#F97316','3단': '#EF4444','사범': '#DC2626'
}

function PercentileBadge({ percentile, large }) {
  const color = percentile <= 5 ? '#DC2626' : percentile <= 15 ? '#F59E0B' : percentile <= 30 ? '#2563EB' : '#2563EB'
  const bg = percentile <= 5 ? '#FEE2E2' : percentile <= 15 ? '#FEF3C7' : percentile <= 30 ? '#EFF6FF' : '#EFF6FF'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: large ? 8 : 5,
      background: bg, borderRadius: 24,
      padding: large ? '10px 20px' : '5px 12px',
      border: `2px solid ${color}20`
    }}>
      <TrendingUp size={large ? 20 : 14} color={color} strokeWidth={2} />
      <span style={{ fontWeight: 900, fontSize: large ? 22 : 13, color }}>
        상위 {percentile}%
      </span>
    </div>
  )
}

function RankIcon({ rank }) {
  if (rank === 1) return <Crown size={18} color="#f59e0b" strokeWidth={2} />
  if (rank === 2) return <Trophy size={18} color="#9ca3af" strokeWidth={2} />
  if (rank === 3) return <Medal size={18} color="#d97706" strokeWidth={2} />
  return <span style={{ fontSize: 13, fontWeight: 700, color: GREY, minWidth: 18, textAlign: 'center' }}>#{rank}</span>
}

export default function RankingPage() {
  const { student } = useStore()
  const [myRank, setMyRank] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [total, setTotal] = useState(0)
  const [percentile, setPercentile] = useState(null)
  const [subjectStats, setSubjectStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/ranking/me'), api.get('/ranking/leaderboard')])
      .then(([me, lb]) => {
        setMyRank(me.data.rank)
        setTotal(me.data.total)
        setPercentile(me.data.percentile)
        setSubjectStats(me.data.subjectStats || [])
        setLeaderboard(lb.data.board || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '32px 20px' }}>
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12, marginBottom: 10 }} />)}
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-gray)', minHeight: '100vh', padding: '32px 20px 80px' }}>

        {/* Hero — my rank */}
        <div style={{
          background: '#2563EB',
          borderRadius: 20, padding: '36px 40px', marginBottom: 28, color: '#fff',
          display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.75, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
              전국 수학 랭킹
            </div>
            <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1, marginBottom: 12, lineHeight: 1 }}>
              전체 {total}명 중<br />
              <span style={{ color: '#fbbf24' }}>{myRank}위</span>
            </h1>
            <PercentileBadge percentile={percentile} large />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>현재 계급</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>{student?.rank}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>누적 XP</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{(student?.xp || 0).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>연속 학습</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{student?.streak_days || 0}일</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: subjectStats.length > 0 ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 28 }}>

          {/* Leaderboard */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', gridColumn: subjectStats.length > 0 ? '1' : '1 / -1' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy size={18} color={GREY} strokeWidth={1.75} /> 전국 리더보드
              </h2>
            </div>
            <div style={{ padding: '8px 0' }}>
              {leaderboard.map((entry, li) => (
                <div
                  key={entry.rank}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                    background: entry.isMe ? 'var(--primary-light)' : li % 2 === 1 ? '#F8FAFC' : 'transparent',
                    borderLeft: entry.isMe ? '3px solid var(--primary)' : '3px solid transparent',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ width: 24, display: 'flex', justifyContent: 'center' }}>
                    <RankIcon rank={entry.rank} />
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: entry.isMe ? 'var(--primary)' : '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: entry.isMe ? '#fff' : GREY }}>
                      {entry.displayName[0]}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: entry.isMe ? 800 : 600, color: entry.isMe ? 'var(--primary)' : 'var(--text)' }}>
                      {entry.displayName}
                      {entry.isMe && <span style={{ fontSize: 11, marginLeft: 6, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>나</span>}
                    </div>
                    <div style={{ fontSize: 11, color: GREY, marginTop: 1 }}>
                      <span style={{ color: RANK_COLORS[entry.rankTitle] || GREY }}>{entry.rankTitle}</span>
                      {entry.totalAttempts > 0 && <> · {entry.accuracy}% 정확도</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {entry.xp.toLocaleString()} <span style={{ fontSize: 11, color: GREY }}>XP</span>
                    </div>
                    {entry.streak > 0 && (
                      <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                        <Flame size={11} color="#f59e0b" /> {entry.streak}일
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* My rank if not in top 20 */}
              {myRank > 20 && (
                <>
                  <div style={{ padding: '6px 20px', color: GREY, fontSize: 12, textAlign: 'center' }}>
                    ···
                  </div>
                  {leaderboard.filter(e => e.isMe).length === 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'var(--primary-light)', borderLeft: '3px solid var(--primary)' }}>
                      <div style={{ width: 24, textAlign: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: GREY }}>#{myRank}</span>
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{student?.display_name?.[0]}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>
                          {student?.display_name} <span style={{ fontSize: 11, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>나</span>
                        </div>
                        <div style={{ fontSize: 11, color: GREY }}>{student?.rank}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {(student?.xp || 0).toLocaleString()} <span style={{ fontSize: 11, color: GREY }}>XP</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Subject rankings */}
          {subjectStats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Target size={18} color={GREY} strokeWidth={1.75} /> 과목별 정확도
                  </h2>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {subjectStats.map(s => {
                    const pct = percentile
                    const subjPercentile = Math.max(1, Math.round(pct * (1 + (s.accuracy - 70) / 200)))
                    return (
                      <div key={s.curriculum}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.curriculum}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: GREY }}>{s.accuracy}%</span>
                            <PercentileBadge percentile={Math.min(99, Math.max(1, subjPercentile))} />
                          </div>
                        </div>
                        <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.accuracy}%`, background: '#2563EB', borderRadius: 3, transition: 'width 0.8s ease' }} />
                        </div>
                        <div style={{ fontSize: 11, color: GREY, marginTop: 3 }}>{s.total}문제 풀이</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Motivational tip */}
              <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f5f3ff)', borderRadius: 16, padding: '20px', border: '1px solid #e0e7ff' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={14} color="var(--primary)" strokeWidth={2} /> 랭크업 팁
                </div>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                  매일 10문제씩 꾸준히 풀면 한 달 안에 <strong>상위 {Math.max(1, percentile - 10)}%</strong>에 진입할 수 있어요!
                  취약 단원을 집중 공략해보세요.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* How ranking works */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: GREY, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} color={GREY} strokeWidth={1.75} /> 랭킹 산정 방식
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: Zap, title: 'XP 누적', desc: '문제를 맞힐 때마다 XP 획득, 연속 학습 시 보너스' },
              { icon: Target, title: '정확도', desc: '맞힌 문제 비율이 높을수록 등급 상승' },
              { icon: Flame, title: '연속 학습', desc: '매일 접속해 스트릭을 유지하면 XP 보너스' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, background: 'var(--primary-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color="var(--primary)" strokeWidth={1.75} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12, color: GREY, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

    </div>
  )
}
