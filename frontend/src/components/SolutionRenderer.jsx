/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SOLUTION RENDERER  —  components/SolutionRenderer.jsx
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Pure structure renderer. ALL math rendering is delegated to MathRenderer.
 *
 * Structure handled here:
 *   • Section box detection  (핵심 아이디어, 핵심 변환, 여기까지 정리하면, …)
 *   • Step detection         (①②③ circled numbers → blue circle UI)
 *   • Final answer box       (∴ / 최종 답 / ✅ triggers styled answer block)
 *
 * No $...$ or $$...$$ parsing lives here. Use MathRenderer for all math.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React from 'react'
import { MathText } from './MathRenderer'

// ─── MathContent — thin wrapper around MathText ───────────────────────────────
// `inline` prop: use <span> for title rows / flex containers.
function MathContent({ children, inline }) {
  if (!children) return null
  const Wrapper = inline ? 'span' : 'div'
  return (
    <Wrapper style={{ fontSize: 15, color: '#1f2937', margin: 0, padding: 0, lineHeight: 1.8 }}>
      <MathText text={String(children)} />
    </Wrapper>
  )
}

// ─── Section keyword detection ────────────────────────────────────────────────
function getSectionKeyword(t) {
  const norm = t.replace(/^#{1,4}\s+/, '').replace(/\*+/g, '').replace(/[：:]\s*$/, '').trim()
  // Suppress "4. 단계별 풀이" style numbered headers
  if (/^\d+\.\s*(단계별|풀이|정리)/.test(norm)) return '단계별'
  if (/^핵심\s*아이디어/.test(norm)) return '핵심아이디어'
  if (/^핵심\s*변환/.test(norm))     return '핵심변환'
  if (/^여기까지\s*정리하면/.test(norm)) return '여기까지정리하면'
  if (/^한\s*줄\s*정리/.test(norm))  return '한줄정리'
  if (/^중간\s*정리/.test(norm))     return '중간정리'
  if (/^최종\s*답/.test(norm))       return '최종답'
  if (/^직관/.test(norm))            return '직관'
  if (/^단계별/.test(norm))          return '단계별'
  if (/^최종\s*정리/.test(norm))     return '최종정리'
  if (/^가벼운/.test(norm))          return '가벼운'
  return null
}

function isNewSection(t) {
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) return true
  if (/^결론\s*[:：]?$/.test(t) || /^결론\s*[:：]\s+\S/.test(t)) return true
  if (/^💡/.test(t) || /^✅/.test(t) || /^❓/.test(t)) return true
  if (/^핵심\s*[:：]/.test(t) || /^최종\s*답\s*[:：]/.test(t) || /^확인\s*질문\s*[:：]/.test(t)) return true
  if (t.startsWith('## ') || t.startsWith('# ') || t.startsWith('### ') || t.startsWith('#### ')) return true
  if (/^(여기까지\s*정리하면|한\s*줄\s*정리)\s*$/.test(t)) return true
  return getSectionKeyword(t) !== null
}

function normalizeStepMarkers(text) {
  const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩']
  const toCircled = n => circled[Math.max(0, Math.min(9, parseInt(n, 10) - 1))]
  return text
    .replace(/^(\d+)단계\s*[:：]\s*/gm, (_, n) => toCircled(n) + ' ')
    .replace(/^단계\s*(\d+)\s*[:：.]\s*/gm, (_, n) => toCircled(n) + ' ')
    .replace(/^(\d+)\.\s*$/gm, (_, n) => toCircled(n))
}

// ─── extractAnswer ────────────────────────────────────────────────────────────
function extractAnswer(body) {
  const match = body.match(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/)
  if (!match) return { body, answer: null }
  const before = body.replace(/\[ANSWER\][\s\S]*?\[\/ANSWER\]/, '').trim()
  return { body: before, answer: match[1].trim() }
}

// ─── parseBlocks ──────────────────────────────────────────────────────────────
function parseBlocks(text) {
  text = normalizeStepMarkers(text)
  // Strip "N. 단계별 풀이" style structural headers — they are noise
  text = text.replace(/^\d+\.\s*단계별\s*풀이\s*$/gm, '')
  // o3 uses "- " and "• " bullet points — strip the marker, keep the text
  text = text.replace(/^[-•]\s+/gm, '')

  const blocks = []
  const lines = text.split('\n')
  let i = 0
  let textAccum = []

  const flushText = () => {
    const content = textAccum.join('\n').trim()
    if (content) {
      const { body, answer } = extractAnswer(content)
      if (body) blocks.push({ type: 'text', content: body })
      if (answer) blocks.push({ type: 'answer', value: answer })
      if (!body && !answer) blocks.push({ type: 'text', content })
    }
    textAccum = []
  }

  const collectBody = () => {
    const bodyLines = []
    while (i < lines.length) {
      const lt = lines[i].trim()
      if (!lt) {
        const ahead = lines.slice(i + 1).find(l => l.trim())
        if (!ahead || isNewSection(ahead.trim())) { i++; break }
        bodyLines.push(''); i++; continue
      }
      if (isNewSection(lt)) break
      bodyLines.push(lines[i]); i++
    }
    return bodyLines.join('\n').trim()
  }

  while (i < lines.length) {
    const t = lines[i].trim()

    if (!t) { textAccum.push(lines[i]); i++; continue }

    // ── [ANSWER]...[/ANSWER] ──
    {
      const ansM = t.match(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/)
      if (ansM) {
        flushText()
        blocks.push({ type: 'answer', value: ansM[1].trim() })
        i++; continue
      }
    }

    // ── ∴ / 결론 / 정답 / 답 ──
    if (/^결론\s*[:：]?$/.test(t) || /^결론\s*[:：]\s+\S/.test(t) ||
        /^(∴|정답\s*[:：]|답\s*[:：])/.test(t)) {
      // Check if [ANSWER] is embedded on this same line
      const embeddedAnswer = t.match(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/)
      if (embeddedAnswer) {
        flushText()
        blocks.push({ type: 'answer', value: embeddedAnswer[1].trim() })
        i++; continue
      }
      flushText()
      const inline = t.replace(/^(결론|∴|정답|답)\s*[:：]?\s*/, '').trim()
      const bodyLines = inline ? [inline] : []
      i++
      while (i < lines.length) {
        const lt = lines[i].trim()
        if (!lt) { i++; break }
        if (isNewSection(lt)) break
        bodyLines.push(lines[i]); i++
      }
      const raw = bodyLines.join('\n').trim()
      const { body: conclusionBody, answer: conclusionAnswer } = extractAnswer(raw)
      if (conclusionBody) blocks.push({ type: 'conclusion', content: conclusionBody })
      if (conclusionAnswer) blocks.push({ type: 'answer', value: conclusionAnswer })
      continue
    }

    // ── ✅ / 최종 답: ──
    if (/^✅/.test(t) || /^최종\s*답\s*[:：]/.test(t)) {
      flushText()
      const content = t.replace(/^✅\s*(최종\s*답\s*[:：])?\s*/, '').replace(/^최종\s*답\s*[:：]\s*/, '').trim()
      blocks.push({ type: 'answer', value: content || '' }); i++; continue
    }

    // ── 💡 / 핵심: ──
    if (/^💡/.test(t) || /^핵심\s*[:：]/.test(t)) {
      flushText()
      const content = t.replace(/^💡\s*(핵심\s*[:：])?\s*/, '').replace(/^핵심\s*[:：]\s*/, '').trim()
      blocks.push({ type: 'conclusion', content }); i++; continue
    }

    // ── ❓ / 확인 질문: ──
    if (/^❓/.test(t) || /^확인\s*질문\s*[:：]/.test(t)) {
      flushText()
      const content = t.replace(/^❓\s*(확인\s*질문\s*[:：])?\s*/, '').replace(/^확인\s*질문\s*[:：]\s*/, '').trim()
      blocks.push({ type: 'closing_question', content }); i++; continue
    }

    // ── Closing question (standalone) ──
    if (t.length < 80 && /여기까지\s*괜찮|헷갈렸어|이해됐어|어느\s*부분이|궁금한\s*부분|더\s*설명/.test(t) && !/^[0-9]/.test(t)) {
      flushText()
      blocks.push({ type: 'closing_question', content: t }); i++; continue
    }

    // ── Section keyword handler ──
    const kw = getSectionKeyword(t)
    if (kw) {
      flushText()
      if (kw === '단계별' || kw === '최종정리') { i++; continue }
      i++
      const rawBody = collectBody()
      const { body, answer: sectionAnswer } = extractAnswer(rawBody)

      switch (kw) {
        case '직관':             if (body) blocks.push({ type: 'intuition',        content: body }); break
        case '핵심아이디어':     if (body) blocks.push({ type: 'key_idea',         content: body }); break
        case '핵심변환':         if (body) blocks.push({ type: 'key_transform',    content: body }); break
        case '여기까지정리하면': if (body) blocks.push({ type: 'midpoint_recap',   content: body }); break
        case '중간정리':         if (body) blocks.push({ type: 'midpoint_recap',   content: body }); break
        case '한줄정리':         if (body) blocks.push({ type: 'one_liner',        content: body }); break
        case '가벼운':           if (body) blocks.push({ type: 'closing_question', content: body }); break
        case '최종답':
          blocks.push({ type: 'answer', value: body || t.replace(/^\*{0,2}([0-9]+\.\s*)?최종\s*답\*{0,2}\s*[:：]?\s*/, '').trim() })
          break
        default:
          if (body) blocks.push({ type: 'text', content: body })
      }
      if (sectionAnswer) blocks.push({ type: 'answer', value: sectionAnswer })
      continue
    }

    // ── Step: circled number ①②③ ──
    if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
      flushText()
      const circledMap = {'①':1,'②':2,'③':3,'④':4,'⑤':5,'⑥':6,'⑦':7,'⑧':8,'⑨':9,'⑩':10}
      const num = circledMap[t[0]] || 1
      const title = t.slice(1).replace(/^[\s:：]+/, '').replace(/^\*+|\*+$/g, '').trim()
      i++
      const { body: stepBody, answer: stepAnswer } = extractAnswer(collectBody())
      blocks.push({ type: 'step', num, title, content: stepBody })
      if (stepAnswer) blocks.push({ type: 'answer', value: stepAnswer })
      continue
    }

    // ── Suppress bare "문제" lines ──
    if (/^(\*\*)?문제(\*\*)?$/.test(t)) { i++; continue }

    // ── Everything else → plain text ──
    textAccum.push(lines[i]); i++
  }

  flushText()
  return blocks
}

// ─── Rendering components ──────────────────────────────────────────────────────

function HighlightSection({ label, children, borderColor, background, labelColor }) {
  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`,
      background,
      borderRadius: '0 4px 4px 0',
      padding: '12px 16px',
      marginTop: 14,
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: labelColor,
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  )
}

const FINAL_ANSWER_LABELS = { ko: '최종 답', en: 'Final Answer', ja: '最終答え', zh: '最终答案' }

function FinalAnswer({ value }) {
  const label = FINAL_ANSWER_LABELS.ko
  // Strip outer $ if present — MathText handles rendering
  const cleanValue = value.replace(/^\$/, '').replace(/\$$/, '').replace(/\\[,;!]/g, ' ').trim()
  return (
    <div style={{ margin: '24px 0 12px' }}>
      <div style={{
        background: '#eff6ff',
        borderLeft: '3px solid #2563eb',
        borderRadius: 4,
        padding: '12px 16px',
      }}>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{label}</span>
          <span style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>∴</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: '1.15rem', color: '#111827' }}>
          <MathText text={`$$${cleanValue}$$`} />
        </div>
      </div>
    </div>
  )
}

// ─── Multi-answer detection ───────────────────────────────────────────────────
function extractMultipleAnswers(text) {
  const answers = []
  const regex = /문제\s*(\d+)\s*[：:]\s*(.*?)\[ANSWER_\d+\]([\s\S]*?)\[\/ANSWER_\d+\]/g
  let m
  while ((m = regex.exec(text)) !== null) {
    answers.push({ num: m[1], label: m[2].trim(), value: m[3].trim() })
  }
  return answers
}

function MultipleAnswers({ answers }) {
  return (
    <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {answers.map((a, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: '#eff6ff',
          borderLeft: '3px solid #2563eb',
          borderRadius: 4,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
            문제 {a.num}
          </span>
          <span style={{ fontSize: 15, color: '#111827' }}>
            <MathText text={`$${a.value}$`} />
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Multi-question splitting (--- divider) ───────────────────────────────────
function parseMultipleSolutions(text) {
  const sections = text.split(/\n---\n/)
  if (sections.length <= 1) return null
  return sections.map(s => s.trim()).filter(Boolean)
}

function SingleSolution({ text }) {
  const blocks = parseBlocks(text)
  let stepCounter = 0
  const firstStepBi = blocks.findIndex(b => b.type === 'step')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {blocks.map((block, bi) => {
        switch (block.type) {

          case 'text':
            if (!block.content) return null
            return (
              <div key={bi} style={{ marginBottom: 2 }}>
                <MathContent>{block.content}</MathContent>
              </div>
            )

          case 'step': {
            stepCounter++
            return (
              <div key={bi} style={{ marginTop: 20, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    minWidth: 26, height: 26, borderRadius: 13, flexShrink: 0,
                    background: '#2563EB', color: '#fff',
                    fontSize: 12, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{stepCounter}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1E3A8A' }}>
                    {block.title
                      ? <MathContent inline>{block.title}</MathContent>
                      : `단계 ${block.num}`
                    }
                  </span>
                </div>
                <div style={{ height: 1, background: '#f0f0f0', marginBottom: 10 }} />
                {block.content && (
                  <div style={{ paddingLeft: 36, fontSize: 15, lineHeight: 1.9 }}>
                    <MathContent>{block.content}</MathContent>
                  </div>
                )}
              </div>
            )
          }

          case 'answer':
            return <FinalAnswer key={bi} value={block.value} />

          case 'conclusion': {
            const lines = (block.content || '').split('\n').map(l => l.trim()).filter(l => l && l !== '∴' && l !== '.')
            if (!lines.length) return null
            return (
              <div key={bi} style={{ marginTop: 16, marginBottom: 4 }}>
                {lines.map((line, j) => (
                  <div key={j} style={{ fontSize: 16, lineHeight: 1.9, color: '#1F2937', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: '#374151', flexShrink: 0 }}>∴</span>
                    <MathContent inline>{line}</MathContent>
                  </div>
                ))}
              </div>
            )
          }

          case 'intuition':
            return (
              <div key={bi} style={{ marginBottom: 2 }}>
                <MathContent>{block.content}</MathContent>
              </div>
            )

          case 'key_idea':
            return (
              <HighlightSection key={bi} label="핵심 아이디어"
                borderColor="#2563eb" background="#eff6ff" labelColor="#2563eb">
                <MathContent>{block.content}</MathContent>
              </HighlightSection>
            )

          case 'key_transform':
            return (
              <div key={bi} style={{ marginBottom: 12, padding: '8px 0', fontSize: 14, color: '#374151' }}>
                <MathContent>{block.content}</MathContent>
              </div>
            )

          case 'midpoint_recap':
            return (
              <div key={bi} style={{ marginBottom: 2 }}>
                <MathContent>{block.content}</MathContent>
              </div>
            )

          case 'one_liner':
            return (
              <div key={bi} style={{
                marginTop: 16, paddingTop: 12,
                borderTop: '1px solid #e5e7eb',
                fontSize: 13, color: '#9ca3af', lineHeight: 1.7,
              }}>
                <MathContent inline>{block.content}</MathContent>
              </div>
            )

          case 'closing_question':
            return (
              <div key={bi} style={{
                marginTop: 22, paddingTop: 14, borderTop: '1px solid #e5e7eb',
                fontSize: 14, color: '#9ca3af', lineHeight: 1.7,
              }}>
                <MathContent inline>{block.content}</MathContent>
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}

function SolutionBlocks({ text }) {
  // Check for [ANSWER_N] style sub-question answers first
  const multiAnswers = extractMultipleAnswers(text)
  if (multiAnswers.length > 1) {
    const stepsText = text.replace(/문제\s*\d+\s*[：:].*?\[ANSWER_\d+\][\s\S]*?\[\/ANSWER_\d+\]/g, '').trim()
    return (
      <div>
        {stepsText && <SingleSolution text={stepsText} />}
        <MultipleAnswers answers={multiAnswers} />
      </div>
    )
  }

  // Check for --- separated full problems
  const sections = parseMultipleSolutions(text)
  if (sections && sections.length > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {sections.map((section, i) => (
          <div key={i} style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '16px 20px',
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              문제 {i + 1}
            </div>
            <SingleSolution text={section} />
          </div>
        ))}
      </div>
    )
  }

  return <SingleSolution text={text} />
}

// ─── Error boundary ────────────────────────────────────────────────────────────
class SolutionErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error, info) { console.error('[SolutionRenderer error]', error, info) }
  componentDidUpdate(prevProps) {
    if (prevProps.text !== this.props.text && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginTop: 8,
          background: '#fef2f2', border: '1px solid #fecaca',
          color: '#dc2626', fontSize: 13, lineHeight: 1.6,
        }}>
          풀이를 표시하는 중 오류가 생겼어. 내용은 저장됐으니 다시 질문해봐.
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────
export default function SolutionRenderer({ text }) {
  return (
    <SolutionErrorBoundary text={text}>
      <SolutionBlocks text={text} />
    </SolutionErrorBoundary>
  )
}
