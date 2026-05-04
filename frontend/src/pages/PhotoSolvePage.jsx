import React, { useState, useRef } from 'react'
import { Camera, Bot, X, AlertTriangle, Pin } from 'lucide-react'
import api from '../utils/api'
import { MathText } from '../components/MathRenderer'

const GREY = '#6B7280'

export default function PhotoSolvePage() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    const valid = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!valid.includes(f.type)) {
      setError('JPG, PNG, GIF, WEBP 형식만 지원합니다.')
      return
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('파일 크기가 15MB를 초과합니다.')
      return
    }
    setFile(f)
    setError(null)
    setAnalysis(null)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await api.post('/photo/analyze', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setAnalysis(res.data.analysis)
    } catch (err) {
      setError(err.response?.data?.error || '분석 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setAnalysis(null)
    setError(null)
  }

  return (
    <div style={{ background: 'var(--bg-gray)', minHeight: 'calc(100vh - var(--nav-height))', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Camera size={28} color={GREY} strokeWidth={1.75} /> 사진으로 문제 풀기
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            수학 문제나 풀이를 사진 찍어 올리면 AI가 분석하고 단계별 풀이를 제공합니다
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: analysis ? '1fr 1fr' : '1fr', gap: 24 }}>
          {/* Upload panel */}
          <div>
            {/* Drop zone */}
            {!file ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  background: dragging ? 'var(--primary-light)' : '#fff',
                  borderRadius: 'var(--radius-xl)',
                  border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                  padding: '64px 32px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
                  <Camera size={56} color={GREY} strokeWidth={1.25} />
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 8, fontSize: 18 }}>
                  {dragging ? '여기에 놓으세요!' : '사진을 드래그하거나 클릭하세요'}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                  JPG, PNG, GIF, WEBP 지원 · 최대 15MB
                </p>
                <div style={{
                  display: 'inline-block',
                  background: 'var(--primary)', color: '#fff',
                  padding: '10px 24px', borderRadius: 6, fontSize: 14, fontWeight: 600
                }}>
                  파일 선택
                </div>
                <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                <div style={{ position: 'relative' }}>
                  <img src={preview} alt="업로드된 이미지" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', background: '#f8f8f8' }} />
                  <button
                    onClick={reset}
                    style={{
                      position: 'absolute', top: 12, right: 12,
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                      border: 'none', borderRadius: '50%', width: 32, height: 32,
                      cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  ><X size={14} color="#fff" strokeWidth={2} /></button>
                </div>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
                    </div>
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      width: '100%', height: 'var(--btn-h)',
                      background: loading ? 'var(--border)' : 'var(--primary)',
                      color: loading ? 'var(--text-muted)' : '#fff',
                      border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                  >
                    {loading ? (
                      <>
                        <span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        AI 분석 중...
                      </>
                    ) : <><Bot size={18} color="#fff" strokeWidth={1.75} /> AI로 분석하기</>}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: 'var(--error-light)', color: 'var(--error)',
                borderRadius: 8, padding: '12px 16px', marginTop: 12, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 8
              }}>
                <AlertTriangle size={14} color="var(--error)" strokeWidth={1.75} style={{ flexShrink: 0 }} /> {error}
              </div>
            )}

            {/* Tips */}
            {!analysis && (
              <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginTop: 20, border: '1px solid var(--border)' }}>
                <h4 style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pin size={14} color={GREY} strokeWidth={1.75} /> 잘 찍는 방법
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    '문제 전체가 사진에 들어오도록 찍어주세요',
                    '흔들리지 않게 수평으로 찍어주세요',
                    '어두운 곳보다 밝은 곳에서 찍으세요',
                    '내 풀이도 함께 찍으면 오류 분석이 가능합니다',
                  ].map((t, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 700 }}>·</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Analysis result */}
          {analysis && (
            <div style={{ background: '#fff', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                color: '#fff', padding: '16px 24px',
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                <Bot size={20} color="#fff" strokeWidth={1.75} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>AI 분석 결과</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Claude AI가 분석했습니다</div>
                </div>
              </div>
              <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 560 }}>
                {analysis.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) {
                    return <div key={i} style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', marginTop: i > 0 ? 20 : 0, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{line.replace('## ', '')}</div>
                  }
                  if (!line.trim()) return <div key={i} style={{ height: 6 }} />
                  return <div key={i} style={{ fontSize: 13, lineHeight: 1.85, color: 'var(--text-secondary)', marginBottom: 4 }}><MathText text={line} /></div>
                })}
              </div>
              <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={reset}
                  style={{
                    marginTop: 16, width: '100%', height: 44,
                    background: 'var(--bg-gray)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  다른 문제 분석하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
