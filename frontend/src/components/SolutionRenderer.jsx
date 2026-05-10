/**
 * SOLUTION RENDERER  —  components/SolutionRenderer.jsx
 *
 * Parses the tagged tutor format:
 *   [핵심아이디어] ... [/핵심아이디어]
 *   [풀이]
 *     STEP N | 제목
 *     ...
 *     [경우 N] 제목
 *     ...
 *     [결합] ...
 *   [/풀이]
 *   [정리]
 *     최종 답: ...
 *     핵심 포인트: ...
 *   [/정리]
 *
 * Math goes through MathText (KaTeX with try/catch fallback).
 * Raw tags are never shown to the user.
 */

import React from 'react'
import { MathText } from './MathRenderer'

// ─── helpers ──────────────────────────────────────────────────────────────────

function MathContent({ children, inline, style }) {
  if (children === undefined || children === null || children === '') return null
  const Wrapper = inline ? 'span' : 'div'
  const baseStyle = inline
    ? { fontSize: 15, color: '#1f2937', lineHeight: 1.55 }
    : { fontSize: 15, color: '#1f2937', lineHeight: 1.6, whiteSpace: 'pre-wrap' }
  return (
    <Wrapper style={{ ...baseStyle, ...style }}>
      <MathText text={String(children)} />
    </Wrapper>
  )
}

// Pull out the first balanced [TAG]...[/TAG] block (case-sensitive Korean tag).
// Returns { inner, before, after } or null.
function sliceTag(text, tag) {
  const open = `[${tag}]`
  const close = `[/${tag}]`
  const i = text.indexOf(open)
  if (i === -1) return null
  const j = text.indexOf(close, i + open.length)
  if (j === -1) {
    // Streaming-friendly: tag opened but not yet closed → take everything after.
    return {
      inner: text.slice(i + open.length).trim(),
      before: text.slice(0, i),
      after: '',
      open: true,
    }
  }
  return {
    inner: text.slice(i + open.length, j).trim(),
    before: text.slice(0, i),
    after: text.slice(j + close.length),
    open: false,
  }
}

// ─── parsers ──────────────────────────────────────────────────────────────────

// Parse the contents of [풀이]. Output is an ordered list of items:
//   { type: 'step', num, title, lines: [{kind:'text'|'interp'|'connect', value}] }
//   { type: 'case', num, title, body, conclusion }
//   { type: 'combine', body }
//   { type: 'text', value }                   ← stray content outside steps/cases
function parseSolutionBody(body) {
  const items = []

  // Split by [경우 N] ... and [결합] ... markers, keeping STEP blocks in between.
  // Strategy: tokenize line-by-line.
  const lines = body.split('\n')
  let i = 0

  // Helpers --------------------------------------------------------------
  const isStepLine = (l) => /^\s*STEP\s+\d+\s*\|/.test(l)
  const isCaseLine = (l) => /^\s*\[경우\s*\d+\]/.test(l)
  const isCombineLine = (l) => /^\s*\[결합\]/.test(l)
  const isBoundary = (l) => isStepLine(l) || isCaseLine(l) || isCombineLine(l)

  const collectUntilBoundary = () => {
    const buf = []
    while (i < lines.length && !isBoundary(lines[i])) {
      buf.push(lines[i])
      i++
    }
    return buf.join('\n').trim()
  }

  // Skip leading blanks
  while (i < lines.length && !lines[i].trim()) i++

  // Any prelude before the first step/case
  const prelude = collectUntilBoundary()
  if (prelude) items.push({ type: 'text', value: prelude })

  while (i < lines.length) {
    const line = lines[i]

    // ── STEP N | 제목 ──
    const stepM = line.match(/^\s*STEP\s+(\d+)\s*\|\s*(.*)$/)
    if (stepM) {
      const num = parseInt(stepM[1], 10)
      const title = stepM[2].trim()
      i++
      const body = collectUntilBoundary()
      items.push({ type: 'step', num, title, body })
      continue
    }

    // ── [경우 N] 제목 ──
    const caseM = line.match(/^\s*\[경우\s*(\d+)\]\s*(.*)$/)
    if (caseM) {
      const num = parseInt(caseM[1], 10)
      const title = caseM[2].trim()
      i++
      const raw = collectUntilBoundary()
      // Pull off "결론: ..." (last occurrence) for emphasized rendering.
      let body = raw
      let conclusion = null
      const conM = raw.match(/(^|\n)\s*결론\s*[:：]\s*([\s\S]*?)\s*$/m)
      if (conM) {
        conclusion = conM[2].trim()
        body = raw.slice(0, conM.index).trim()
      }
      items.push({ type: 'case', num, title, body, conclusion })
      continue
    }

    // ── [결합] ... ──
    if (isCombineLine(line)) {
      const firstLineRest = line.replace(/^\s*\[결합\]\s*/, '').trim()
      i++
      const more = collectUntilBoundary()
      const body = [firstLineRest, more].filter(Boolean).join('\n').trim()
      items.push({ type: 'combine', body })
      continue
    }

    // Unreachable in practice — boundary detection above covers all cases.
    // Defensive skip.
    i++
  }

  return items
}

// Step body has up to three logical parts:
//   1) intro sentence(s) before any math
//   2) math expression(s) (display $$...$$ or inline mixed with text)
//   3) "→ 이 결과가 의미하는 것: ..." interpretation line(s)
//   4) trailing connection sentence to next step
//
// We render the body mostly as-is via MathText, but pull out the
// interpretation line (italic gray) and the trailing connection sentence
// (muted gray) so they get distinct styling.
function splitStepBody(raw) {
  const lines = raw.split('\n')
  const interp = []
  const main = []
  for (const line of lines) {
    if (/^\s*→/.test(line)) {
      interp.push(line.replace(/^\s*→\s*/, '').trim())
    } else {
      main.push(line)
    }
  }

  // Trailing connection sentence: last non-empty line of `main` that is
  // plain Korean prose (no $...$ math, not starting with a list marker).
  let connect = null
  for (let k = main.length - 1; k >= 0; k--) {
    const t = main[k].trim()
    if (!t) continue
    const looksLikeMath = /\$/.test(t) || /^\s*[-•]/.test(t)
    if (!looksLikeMath && /[다요까]\.?$/.test(t) && main.slice(0, k).some(l => l.trim())) {
      connect = t
      main.splice(k, 1)
      break
    }
    break
  }

  return {
    body: main.join('\n').trim(),
    interp: interp.join(' ').trim(),
    connect,
  }
}

// Parse [정리] block into { finalAnswer, keyPoint, rest }.
function parseSummary(body) {
  let finalAnswer = null
  let keyPoint = null
  const rest = []
  const lines = body.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    let m = t.match(/^최종\s*답\s*[:：]\s*(.*)$/)
    if (m) { finalAnswer = m[1].trim(); continue }
    m = t.match(/^핵심\s*포인트\s*[:：]\s*(.*)$/)
    if (m) { keyPoint = m[1].trim(); continue }
    rest.push(t)
  }
  return { finalAnswer, keyPoint, rest: rest.join('\n').trim() }
}

// ─── styled subcomponents ────────────────────────────────────────────────────

function KeyIdeaBox({ children }) {
  return (
    <div style={{
      background: '#eff6ff',
      borderLeft: '4px solid #2563eb',
      borderRadius: '0 8px 8px 0',
      padding: 16,
      margin: '8px 0 12px',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 6,
      }}>
        💡 핵심 아이디어
      </div>
      <MathContent>{children}</MathContent>
    </div>
  )
}

function StepBlock({ num, title, body, isFirst }) {
  const { body: cleanBody, interp, connect } = splitStepBody(body || '')
  return (
    <div style={{
      paddingTop: isFirst ? 0 : 12,
      marginTop: isFirst ? 0 : 12,
      borderTop: isFirst ? 'none' : '1px solid #e5e7eb',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: '#2563eb',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: 999,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          STEP {num}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
          <MathContent inline>{title}</MathContent>
        </span>
      </div>
      {cleanBody && (
        <div style={{ paddingLeft: 4 }}>
          <MathContent>{cleanBody}</MathContent>
        </div>
      )}
      {interp && (
        <div style={{
          paddingLeft: 4,
          marginTop: 6,
          fontStyle: 'italic',
          color: '#6b7280',
          fontSize: 14,
          lineHeight: 1.55,
        }}>
          → <MathContent inline style={{ fontStyle: 'italic', color: '#6b7280', fontSize: 14 }}>{interp}</MathContent>
        </div>
      )}
      {connect && (
        <div style={{
          paddingLeft: 4,
          marginTop: 8,
          color: '#6b7280',
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          <MathContent inline style={{ color: '#6b7280', fontSize: 14 }}>{connect}</MathContent>
        </div>
      )}
    </div>
  )
}

const CASE_COLORS = [
  { border: '#2563eb', badgeBg: '#dbeafe', badgeFg: '#1d4ed8' },     // 경우 1 = blue
  { border: '#7c3aed', badgeBg: '#ede9fe', badgeFg: '#6d28d9' },     // 경우 2 = purple
  { border: '#0d9488', badgeBg: '#ccfbf1', badgeFg: '#0f766e' },     // 경우 3 = teal
  { border: '#d97706', badgeBg: '#fef3c7', badgeFg: '#b45309' },     // 경우 4 = amber
]

function CaseBlock({ num, title, body, conclusion }) {
  const c = CASE_COLORS[(num - 1) % CASE_COLORS.length]
  return (
    <div style={{
      marginTop: 12,
      marginLeft: 12,
      padding: 16,
      borderLeft: `4px solid ${c.border}`,
      background: '#fafafa',
      borderRadius: '0 8px 8px 0',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: c.badgeBg,
          color: c.badgeFg,
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: 999,
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          경우 {num}
        </span>
        {title && (
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            <MathContent inline>{title}</MathContent>
          </span>
        )}
      </div>
      {body && <MathContent>{body}</MathContent>}
      {conclusion && (
        <div style={{ marginTop: 8, fontSize: 14, color: '#374151', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 700, color: c.badgeFg, flexShrink: 0 }}>결론</span>
          <MathContent inline>{conclusion}</MathContent>
        </div>
      )}
    </div>
  )
}

function CombineCallout({ body }) {
  return (
    <div style={{
      marginTop: 14,
      padding: 16,
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <span style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#b45309',
        lineHeight: 1.4,
        flexShrink: 0,
      }}>∴</span>
      <div style={{ fontWeight: 700, color: '#92400e', lineHeight: 1.55 }}>
        <MathContent inline style={{ fontWeight: 700, color: '#92400e' }}>{body}</MathContent>
      </div>
    </div>
  )
}

function SummaryCard({ finalAnswer, keyPoint, rest }) {
  return (
    <div style={{
      marginTop: 16,
      padding: 16,
      background: '#f3f4f6',
      borderRadius: 10,
      border: '1px solid #e5e7eb',
    }}>
      {finalAnswer !== null && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            최종 답
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1.5 }}>
            <MathContent inline style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
              {finalAnswer}
            </MathContent>
          </div>
        </div>
      )}
      {keyPoint && (
        <div style={{
          marginTop: finalAnswer !== null ? 10 : 0,
          fontSize: 13,
          fontStyle: 'italic',
          color: '#4b5563',
          lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600, fontStyle: 'normal', marginRight: 6 }}>핵심 포인트:</span>
          <MathContent inline style={{ fontSize: 13, fontStyle: 'italic', color: '#4b5563' }}>
            {keyPoint}
          </MathContent>
        </div>
      )}
      {rest && (
        <div style={{ marginTop: 10, fontSize: 14, color: '#374151' }}>
          <MathContent>{rest}</MathContent>
        </div>
      )}
    </div>
  )
}

// ─── strip raw tag echoes from any string we render ──────────────────────────
// Defensive: if the model emits an opening/closing tag inside a body, hide it.
function scrubTags(s) {
  if (!s) return s
  return String(s)
    .replace(/\[\/?핵심아이디어\]/g, '')
    .replace(/\[\/?풀이\]/g, '')
    .replace(/\[\/?정리\]/g, '')
}

// ─── main renderer ───────────────────────────────────────────────────────────

function TaggedSolution({ text }) {
  const cleaned = scrubLabels(text)

  // Split into the three top-level sections.
  let remaining = cleaned
  const keyIdeaSlice = sliceTag(remaining, '핵심아이디어')
  let keyIdea = null
  if (keyIdeaSlice) {
    keyIdea = scrubTags(keyIdeaSlice.inner)
    remaining = (keyIdeaSlice.before + '\n' + keyIdeaSlice.after).trim()
  }

  const solutionSlice = sliceTag(remaining, '풀이')
  let solutionItems = []
  if (solutionSlice) {
    solutionItems = parseSolutionBody(scrubTags(solutionSlice.inner))
    remaining = (solutionSlice.before + '\n' + solutionSlice.after).trim()
  }

  const summarySlice = sliceTag(remaining, '정리')
  let summary = null
  if (summarySlice) {
    summary = parseSummary(scrubTags(summarySlice.inner))
    remaining = (summarySlice.before + '\n' + summarySlice.after).trim()
  }

  // Anything left over: render as plain text (degraded mode).
  const leftover = scrubTags(remaining).trim()

  // If nothing was tagged, show the raw text via MathText so partial / legacy
  // outputs still display while streaming.
  if (!keyIdea && solutionItems.length === 0 && !summary && leftover) {
    return <MathContent>{leftover}</MathContent>
  }

  let firstStepRendered = true
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {keyIdea && <KeyIdeaBox>{keyIdea}</KeyIdeaBox>}

      {solutionItems.length > 0 && (
        <div style={{
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {solutionItems.map((item, idx) => {
            if (item.type === 'step') {
              const isFirst = firstStepRendered
              firstStepRendered = false
              return (
                <StepBlock
                  key={idx}
                  num={item.num}
                  title={item.title}
                  body={item.body}
                  isFirst={isFirst}
                />
              )
            }
            if (item.type === 'case') {
              return (
                <CaseBlock
                  key={idx}
                  num={item.num}
                  title={item.title}
                  body={item.body}
                  conclusion={item.conclusion}
                />
              )
            }
            if (item.type === 'combine') {
              return <CombineCallout key={idx} body={item.body} />
            }
            if (item.type === 'text') {
              return (
                <div key={idx} style={{ marginBottom: 8 }}>
                  <MathContent>{item.value}</MathContent>
                </div>
              )
            }
            return null
          })}
        </div>
      )}

      {summary && (
        <SummaryCard
          finalAnswer={summary.finalAnswer}
          keyPoint={summary.keyPoint}
          rest={summary.rest}
        />
      )}

      {leftover && (
        <div style={{ marginTop: 8 }}>
          <MathContent>{leftover}</MathContent>
        </div>
      )}
    </div>
  )
}

// Strip leading numeric prefixes from section header lines that appear
// adjacent to our tags (e.g. "1. 핵심아이디어" → "핵심아이디어"), per spec.
function scrubLabels(text) {
  if (!text) return ''
  return String(text)
    .replace(/^\s*\d+\.\s*(?=\[)/gm, '')
    .replace(/^\s*\d+\.\s*(핵심\s*아이디어|풀이|정리)\s*$/gm, '$1')
}

// ─── Error boundary ──────────────────────────────────────────────────────────

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
          padding: 16, borderRadius: 8, marginTop: 8,
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

// ─── Main export ─────────────────────────────────────────────────────────────

export default function SolutionRenderer({ text }) {
  return (
    <SolutionErrorBoundary text={text}>
      <TaggedSolution text={text || ''} />
    </SolutionErrorBoundary>
  )
}
