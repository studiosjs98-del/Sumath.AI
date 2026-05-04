import React, { useState } from 'react'
import api from '../utils/api'
import useStore from '../store/useStore'

const GRADE_ROWS = [
  ['중1', '중2', '중3'],
  ['고1', '고2', '고3'],
]

const FEATURES = [
  {
    icon: '①',
    iconBg: '#4F7EFF',
    title: '단계별 풀이',
    desc: '사진 찍어서 올리면 수학이가 단계별로 풀어줘. 왜 그런지까지 설명해줘.',
  },
  {
    icon: '✎',
    iconBg: '#34C759',
    title: '연습 문제 생성',
    desc: '풀이 보고 나서 비슷한 문제 5개 바로 풀어볼 수 있어. 틀리면 피드백도 줘.',
  },
  {
    icon: '▦',
    iconBg: '#FF9500',
    title: '내 약점 분석',
    desc: '틀린 문제들을 분석해서 어떤 개념이 약한지 정확하게 짚어줘.',
  },
]

export default function OnboardingFlow({ onComplete }) {
  const [screen, setScreen] = useState(1)
  const [selectedGrade, setSelectedGrade] = useState(null)
  const [fading, setFading] = useState(false)
  const updateStudent = useStore(s => s.updateStudent)

  const goToScreen2 = () => {
    setFading(true)
    setTimeout(() => {
      setScreen(2)
      setFading(false)
    }, 200)
  }

  const finish = async () => {
    try {
      await api.patch('/auth/grade', { grade_level: selectedGrade })
      updateStudent({ grade_level: selectedGrade })
    } catch (_) {
      // best effort — still proceed
    }
    localStorage.setItem('onboarding_complete', 'true')
    localStorage.setItem('onboarding_grade', selectedGrade)
    onComplete(selectedGrade)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#fff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.2s ease',
    }}>
      {screen === 1 ? (
        <div style={{
          width: '100%', maxWidth: 420,
          padding: '0 24px', boxSizing: 'border-box',
          textAlign: 'center',
        }}>
          {/* Σ logo */}
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#4F7EFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto',
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'serif', lineHeight: 1 }}>Σ</span>
          </div>

          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111', marginTop: 32, marginBottom: 0 }}>
            수학 마스터에 오신 걸 환영해
          </h1>
          <p style={{ fontSize: '1rem', color: '#888', marginTop: 8, marginBottom: 32 }}>
            몇 학년이야?
          </p>

          {/* Grade grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
            {GRADE_ROWS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 12 }}>
                {row.map(grade => (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    style={{
                      flex: 1,
                      background: selectedGrade === grade ? '#F0F4FF' : '#fff',
                      border: `1.5px solid ${selectedGrade === grade ? '#4F7EFF' : '#e0e0e0'}`,
                      borderRadius: 10,
                      padding: '14px 24px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: selectedGrade === grade ? '#4F7EFF' : '#333',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseOver={e => {
                      if (selectedGrade !== grade) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <button
            onClick={goToScreen2}
            disabled={!selectedGrade}
            style={{
              width: '100%',
              background: selectedGrade ? '#4F7EFF' : '#d1d5db',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '14px 0',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: selectedGrade ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease',
            }}
          >
            다음
          </button>
        </div>
      ) : (
        <div style={{
          width: '100%', maxWidth: 420,
          padding: '0 24px', boxSizing: 'border-box',
        }}>
          <h1 style={{
            fontSize: '1.4rem', fontWeight: 800, color: '#111',
            marginBottom: 24, textAlign: 'center',
          }}>
            수학이가 이렇게 도와줄게
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                background: '#fff',
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: f.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 16, color: '#fff', fontWeight: 700,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111', marginBottom: 4 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: '#666', lineHeight: 1.5 }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={finish}
            style={{
              width: '100%',
              background: '#4F7EFF',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '14px 0',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            수학이랑 시작하기
          </button>
        </div>
      )}
    </div>
  )
}
