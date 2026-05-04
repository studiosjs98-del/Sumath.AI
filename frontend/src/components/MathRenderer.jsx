import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// ─── KaTeX helper ─────────────────────────────────────────────────────────────
function renderKatex(latex, displayMode) {
  try {
    return katex.renderToString(String(latex), {
      throwOnError: false,
      strict: false,
      displayMode,
    })
  } catch (e) {
    console.error('[MathRenderer] KaTeX error:', e.message, '\nInput:', String(latex))
    return `<span style="color:red;font-family:monospace;font-size:0.85em">${String(latex)}</span>`
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const KOREAN = /[\uAC00-\uD7A3]/
const ORPHAN = /^\s*\$\s*$/

function normalizeMath(text) {
  // Extract [ANSWER] blocks first — protect them from all normalization
  const answerBlocks = []
  text = text.replace(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/g, (_, content) => {
    answerBlocks.push(content)
    return `[ANSWER_PLACEHOLDER_${answerBlocks.length - 1}]`
  })

  text = text
    // o3 uses \(...\) for inline and \[...\] for display
    .replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, '$$$1$$')
    .replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, '$$$$$1$$$$')
    // o3 sometimes outputs \( \) with newlines inside — catch multiline
    .replace(/\\\(\n([\s\S]+?)\n\\\)/g, '$$$$$1$$$$')
    // bare \begin{...}...\end{...} → $$...$$
    .replace(/(^|\n)(\\begin\{[^}]+\}[\s\S]+?\\end\{[^}]+\})/g, '$1$$$$$2$$$$')
    // lone $ or $$ lines → delete
    .replace(/^\s*\$\$?\s*$/gm, '')
    // strip **bold**
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    // Remove \, thin space at start of inline expressions
    .replace(/\$\\,/g, '$')
    // units stuck directly to digits inside math → wrap in \text{ }
    .replace(/(\d)(rad|deg|cm|km|m)\b/g, '$1\\text{ $2}')
    // → arrows between math expressions — ensure spaces and valid delimiters
    .replace(/\$\s*→\s*\$/g, '$ → $')
    .replace(/\$\s*→\s*(\d)/g, '$ → $$$1')
    .split('\n').map(line => {
      if (/\$/.test(line)) return line
      if (/\[ANSWER/.test(line)) return line
      const hasLatex = /\\(frac|sqrt|cdot|times|ge|le|geq|leq|sum|prod|int|left|right|text|begin|end|sin|cos|tan|approx|pi|theta|alpha|beta|gamma|in|notin|Rightarrow|rightarrow|infty|partial)\b/.test(line)
      if (!hasLatex) return line
      const koreanRatio = (line.match(/[\uAC00-\uD7A3]/g) || []).length / (line.length || 1)
      if (koreanRatio > 0.4) return line
      return `$$${line.trim()}$$`
    }).join('\n')

  // Restore [ANSWER] blocks untouched
  text = text.replace(/\[ANSWER_PLACEHOLDER_(\d+)\]/g, (_, i) =>
    `[ANSWER]${answerBlocks[parseInt(i)]}[/ANSWER]`
  )

  return text
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────
// Token types:
//   display  — \begin{...}...\end{...}  |  $$...$$
//   inline   — $...$  (tightened guard below)
//   text     — everything else
function tokenize(raw) {
  if (!raw) return []
  const text = normalizeMath(raw)

  const tokens = []
  // Group 1: bare \begin{...}...\end{...} environment → display
  // Group 2: $$...$$ → display
  // Group 3: $...$ inline  ((?!\d) guards $1/$2/$3 etc.)
  const re = /(\\begin\{[^}]+\}[\s\S]+?\\end\{[^}]+\})|\$\$([\s\S]+?)\$\$|\$(?!\d\s*,)([\s\S]+?)\$/g

  let lastIndex = 0
  let m

  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }

    if (m[1] !== undefined) {
      tokens.push({ type: 'display', value: m[1].trim() })
    } else if (m[2] !== undefined) {
      tokens.push({ type: 'display', value: m[2].trim() })
    } else if (m[3] !== undefined) {
      const content = m[3].trim()
      if (KOREAN.test(content) || content.length > 300) {
        tokens.push({ type: 'text', value: m[0] })
      } else {
        tokens.push({ type: 'inline', value: content })
      }
    }

    lastIndex = re.lastIndex
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) })
  }

  // Drop orphaned lone $ tokens
  return tokens.filter(t => !(t.type === 'text' && ORPHAN.test(t.value)))
}

// ─── Token renderer ───────────────────────────────────────────────────────────
function renderToken(token, i) {
  switch (token.type) {
    case 'display':
      // Block: centred, slight padding, scrollable for wide equations
      return (
        <span
          key={i}
          style={{ display: 'block', textAlign: 'center', padding: '8px 0', overflowX: 'auto', fontSize: '1.15em' }}
          dangerouslySetInnerHTML={{ __html: renderKatex(token.value, true) }}
        />
      )

    case 'inline':
      // Inline: no padding, no margin — flows with surrounding text
      return (
        <span
          key={i}
          style={{ display: 'inline' }}
          dangerouslySetInnerHTML={{ __html: renderKatex(token.value, false) }}
        />
      )

    case 'text':
    default:
      return <span key={i} style={{ display: 'inline' }}>{token.value}</span>
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * MathText — render any string containing Korean + $...$ / $$...$$ math.
 */
export function MathText({ text, className = '' }) {
  if (!text) return null
  const tokens = tokenize(String(text))
  return (
    <span className={className} style={{ lineHeight: 1.6 }}>
      {tokens.map(renderToken)}
    </span>
  )
}

// Alias — identical behaviour, different name for semantic clarity
export const MathMixed = MathText

/**
 * MathBlock — display-mode block for a pure LaTeX expression.
 * Falls back to MathText for mixed text (contains $ or Korean).
 */
export function MathBlock({ latex, className = '' }) {
  if (!latex) return null
  const s = String(latex)
  if (s.includes('$') || KOREAN.test(s)) {
    return (
      <div className={`math-block ${className}`} style={{ overflowX: 'auto', padding: '8px 0', lineHeight: 1.8 }}>
        <MathText text={s} />
      </div>
    )
  }
  return (
    <div
      className={`math-block ${className}`}
      dangerouslySetInnerHTML={{ __html: renderKatex(s, true) }}
      style={{ overflowX: 'auto', padding: '8px 0' }}
    />
  )
}

/**
 * MathInline — inline-mode span for a pure LaTeX expression.
 * Falls back to MathText for mixed text (contains $ or Korean).
 */
export function MathInline({ latex, className = '' }) {
  if (!latex) return null
  const s = String(latex)
  if (s.includes('$') || KOREAN.test(s)) {
    return <MathText text={s} className={className} />
  }
  return (
    <span
      className={`math-inline ${className}`}
      dangerouslySetInnerHTML={{ __html: renderKatex(s, false) }}
    />
  )
}
