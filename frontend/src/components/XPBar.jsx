import React from 'react'

const RANK_XP = [
  { rank: '9급', minXp: 0 },    { rank: '8급', minXp: 100 },
  { rank: '7급', minXp: 250 },   { rank: '6급', minXp: 500 },
  { rank: '5급', minXp: 800 },   { rank: '4급', minXp: 1200 },
  { rank: '3급', minXp: 1800 },  { rank: '2급', minXp: 2600 },
  { rank: '1급', minXp: 3500 },  { rank: '초단', minXp: 5000 },
  { rank: '1단', minXp: 7000 },  { rank: '2단', minXp: 9500 },
  { rank: '3단', minXp: 12500 }, { rank: '사범', minXp: 20000 }
]

const rankColors = {
  '9급': '#94A3B8', '8급': '#94A3B8', '7급': '#94A3B8',
  '6급': '#38BDF8', '5급': '#38BDF8', '4급': '#38BDF8',
  '3급': '#2563EB', '2급': '#2563EB', '1급': '#2563EB',
  '초단': '#F59E0B', '1단': '#F59E0B', '2단': '#F97316',
  '3단': '#EF4444', '사범': '#DC2626'
}

export default function XPBar({ student }) {
  if (!student) return null
  const rankIdx = RANK_XP.findIndex(r => r.rank === student.rank)
  const rankInfo = RANK_XP[rankIdx] || RANK_XP[0]
  const nextRank = RANK_XP[rankIdx + 1]
  const progress = nextRank
    ? ((student.xp - rankInfo.minXp) / (nextRank.minXp - rankInfo.minXp)) * 100
    : 100
  const color = rankColors[student.rank] || 'var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: '900', color }}>{student.rank}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(student.xp || 0).toLocaleString()} XP</span>
        </div>
        {nextRank && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            다음: {nextRank.rank} ({(nextRank.minXp - (student.xp || 0)).toLocaleString()} XP)
          </span>
        )}
      </div>
      <div style={{ height: '8px', background: 'var(--bg-gray)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, progress))}%`,
          height: '100%', borderRadius: '4px',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 1s ease-out'
        }} />
      </div>
    </div>
  )
}
