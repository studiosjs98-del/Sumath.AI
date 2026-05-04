/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CENTRALIZED MATH RENDERING UTILITY  —  utils/katex.js
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * This is the ONE AND ONLY place where KaTeX is called in the entire app.
 * ALL math rendering must go through the functions exported here.
 *
 * ⚠️  DO NOT add katex.renderToString calls anywhere else in the codebase.
 * ⚠️  DO NOT modify this file without testing ALL of the following:
 *     • Inline math:   $x^2 + y^2 = r^2$
 *     • Display math:  $$\frac{-b \pm \sqrt{b^2-4ac}}{2a}$$
 *     • Alt delimiters: \(...\) and \[...\]
 *     • Backslash-corrupted AI responses: frac / sqrt / pm without leading \
 *     • Single char:   $D$, $x$
 *     • Error cases:   must fall back to plain text, NEVER show red KaTeX errors
 *     • Bold + italic: **text**, *text*
 *     • Mixed:         "판별식 $D = b^2 - 4ac$ 를 구해봐"
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import katex from 'katex'
import React from 'react'

// ─── Internal helpers ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
// alias used internally
const esc = escapeHtml

function latexToPlainText(str) {
  return str
    .replace(/\\[a-zA-Z]+\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function autoWrapMath(text) {
  const parts = []
  // Match $$...$$ (display) or $...$  (inline).
  // For inline, allow backslash-sequences (\\frac, \\sqrt etc.) as atomic units so
  // the single-letter auto-wrap below never runs inside a partially-protected expression.
  const re = /\$\$[\s\S]*?\$\$|\$((?:[^$\n\\]|\\.)+?)\$/g
  let pos = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > pos) parts.push([false, text.slice(pos, m.index)])
    parts.push([true, m[0]])
    pos = re.lastIndex
  }
  if (pos < text.length) parts.push([false, text.slice(pos)])
  return parts.map(([prot, s]) => prot ? s :
    // Wrap single-letter vars with subscript/superscript: a_n, x^2 etc.
    s.replace(
      /(?<![A-Za-z0-9$\\])([A-Za-z](?:_\{[^}\n]*\}|_[A-Za-z0-9]+|\^\{[^}\n]*\}|\^[A-Za-z0-9]+))(?![A-Za-z0-9${])/g,
      '$$$1$$'
    )
  ).join('')
}

const KATEX_OPTS = { throwOnError: false, strict: 'ignore', output: 'html' }

// ─── renderSafe ───────────────────────────────────────────────────────────────
/**
 * Internal: render LaTeX safely, falling back to styled plain text if KaTeX
 * produces error spans (katex-error class) or throws.
 * This is the ONLY place katex.renderToString is called.
 */
function renderSafe(latex, displayMode) {
  const clean = sanitizeLatex(String(latex).trim())
  let html
  try {
    html = katex.renderToString(clean, { ...KATEX_OPTS, displayMode })
  } catch {
    html = null
  }
  // KaTeX uses throwOnError:false so it never throws but may emit error spans.
  // If error HTML was produced, fall back to italicised plain text.
  if (!html || html.includes('katex-error')) {
    const fallback = esc(latexToPlainText(clean))
    return displayMode
      ? `<span style="display:block;text-align:center;font-style:italic;color:#374151;padding:4px 0">${fallback}</span>`
      : `<span style="font-style:italic;color:#374151">${fallback}</span>`
  }
  return html
}

// ─── sanitizeLatex ─────────────────────────────────────────────────────────────
/**
 * Restore backslashes that JSON.parse strips from LaTeX commands, and remove
 * KaTeX-unsupported commands that would produce red error text.
 * This runs on every math segment before KaTeX sees it.
 */
export function sanitizeLatex(str) {
  if (!str) return str

  // 1. Restore backslashes that JSON.parse stripped from unknown escape seqs.
  //    JSON treats \f (0x0C), \t (0x09), \b (0x08) as whitespace escapes,
  //    so "\frac" in the AI response becomes [FF]rac in the parsed string.
  str = str.replace(/\t([a-zA-Z])/g, '\\t$1')    // \t + letter → \t_letter
  str = str.replace(/\f([a-zA-Z])/g, '\\f$1')    // form-feed + letter → \f_letter
  str = str.replace(/\x08([a-zA-Z])/g, '\\b$1')  // backspace + letter → \b_letter

  const fixes = [
    // Restore most-common missing backslashes
    [/(?<!\\)cdot(?![a-zA-Z])/g, '\\cdot'],
    [/(?<!\\)frac(?=\{)/g, '\\frac'],
    [/(?<!\\)sqrt(?=\{|\[)/g, '\\sqrt'],
    [/(?<!\\)times(?![a-zA-Z])/g, '\\times'],
    [/(?<!\\)div(?![a-zA-Z])/g, '\\div'],
    [/(?<!\\)pm(?![a-zA-Z])/g, '\\pm'],
    [/(?<!\\)infty(?![a-zA-Z])/g, '\\infty'],
    [/(?<!\\)alpha(?![a-zA-Z])/g, '\\alpha'],
    [/(?<!\\)beta(?![a-zA-Z])/g, '\\beta'],
    [/(?<!\\)gamma(?![a-zA-Z])/g, '\\gamma'],
    [/(?<!\\)delta(?![a-zA-Z])/g, '\\delta'],
    [/(?<!\\)theta(?![a-zA-Z])/g, '\\theta'],
    [/(?<!\\)pi(?![a-zA-Z])/g, '\\pi'],
    [/(?<!\\)sigma(?![a-zA-Z])/g, '\\sigma'],
    [/(?<!\\)omega(?![a-zA-Z])/g, '\\omega'],
    [/(?<!\\)lambda(?![a-zA-Z])/g, '\\lambda'],
    [/(?<!\\)mu(?![a-zA-Z])/g, '\\mu'],
    [/(?<!\\)int(?![a-zA-Z])/g, '\\int'],
    [/(?<!\\)sum(?![a-zA-Z])/g, '\\sum'],
    [/(?<!\\)prod(?![a-zA-Z])/g, '\\prod'],
    [/(?<!\\)lim(?![a-zA-Z])/g, '\\lim'],
    [/(?<!\\)log(?![a-zA-Z])/g, '\\log'],
    [/(?<!\\)ln(?![a-zA-Z])/g, '\\ln'],
    [/(?<!\\)sin(?![a-zA-Z])/g, '\\sin'],
    [/(?<!\\)cos(?![a-zA-Z])/g, '\\cos'],
    [/(?<!\\)tan(?![a-zA-Z])/g, '\\tan'],
    [/(?<!\\)leq(?![a-zA-Z])/g, '\\leq'],
    [/(?<!\\)geq(?![a-zA-Z])/g, '\\geq'],
    [/(?<!\\)neq(?![a-zA-Z])/g, '\\neq'],
    [/(?<![a-zA-Z\\])in(?![a-zA-Z])/g, '\\in'],
    [/(?<!\\)subset(?![a-zA-Z])/g, '\\subset'],
    [/(?<!\\)cup(?![a-zA-Z])/g, '\\cup'],
    [/(?<!\\)cap(?![a-zA-Z])/g, '\\cap'],
    [/(?<!\\)left(?![a-zA-Z])/g, '\\left'],
    [/(?<!\\)right(?![a-zA-Z])/g, '\\right'],
    [/(?<!\\)partial(?![a-zA-Z])/g, '\\partial'],
    [/(?<!\\)text\{/g, '\\text{'],
    [/(?<!\\)begin\{/g, '\\begin{'],
    [/(?<!\\)end\{/g, '\\end{'],
    [/(?<!\\)boxed\{/g, '\\boxed{'],
    // Remove KaTeX-unsupported commands (would render as red error text)
    [/\\d(?![a-zA-Z{])/g, 'd'],
    [/\\tag\{[^}]*\}/g, ''],
    [/\\label\{[^}]*\}/g, ''],
    [/\\ref\{[^}]*\}/g, ''],
    [/\\eqref\{[^}]*\}/g, ''],
    [/\\DeclareMathOperator\*?\{[^}]*\}\{[^}]*\}/g, ''],
    [/\\newcommand\{[^}]*\}(?:\[[^\]]*\])?\{[^}]*\}/g, ''],
    [/\\textbf\{([^}]*)\}/g, '\\mathbf{$1}'],
    [/\\textit\{([^}]*)\}/g, '\\mathit{$1}'],
    [/\\textrm\{([^}]*)\}/g, '\\text{$1}'],
    [/\\text\s+\{/g, '\\text{'],
  ]
  fixes.forEach(([pattern, replacement]) => { str = str.replace(pattern, replacement) })
  return str
}

// ─── sanitizeAIResponse ───────────────────────────────────────────────────────
/**
 * Comprehensive preprocessor for full AI response strings.
 *
 * This is the single source of truth for normalising AI math output.
 * Run it ONCE on the complete AI response before any rendering or parsing.
 * It is idempotent — safe to call multiple times on the same text.
 *
 * What it fixes:
 *   1. Delimiter variants  \(...\) / \[...\] → $ / $$
 *   2. Split mixed lines   "두 번째 방정식: $$ 4a + 2b = 9"  →  two clean lines
 *   3. Equation labels     \quad (1)  stripped from inside math
 *   4. Backslash fixes     \* → \cdot,  \\boxed → \boxed
 *   5. Stray delimiters    dangling lone $$ at line-end removed
 *   6. Korean adjacency    $$ immediately before Korean text collapsed
 *   7. Sentence spacing    period+Korean → ". Korean"
 */
function injectNewlines(text) {
  return text
    // Put newline before every $$ that follows Korean text or punctuation
    .replace(/([가-힣ㄱ-ㅎㅏ-ㅣ。、，.!?:]\s*)\$\$/g, '$1\n\n$$')
    // Put newline after every $$ that is followed by Korean text
    .replace(/\$\$\s*([가-힣ㄱ-ㅎㅏ-ㅣ])/g, '$$\n\n$1')
    // Put newline before every $ that follows Korean text
    .replace(/([가-힣ㄱ-ㅎㅏ-ㅣ。、，.!?]\s*)\$(?!\$)/g, '$1\n\n$')
    // Put newline after every closing $ that is followed by Korean text
    .replace(/(?<!\$)\$\s*([가-힣ㄱ-ㅎㅏ-ㅣ])/g, '$\n\n$1')
    // Split on period followed immediately by Korean character with no space
    .replace(/([.!?])([가-힣])/g, '$1\n$2')
    // Ensure \\ (line break inside equations) becomes actual newline outside
    .replace(/\\\\\s*(?=[가-힣])/g, '\\\\\n\n')
}

export function sanitizeAIResponse(text) {
  if (!text) return text

  // ── 0. Inject newlines before any other processing ───────────────────────────
  // The AI sends responses as one continuous text block with no newlines between
  // sentences and equations. All subsequent steps require newlines to split on,
  // so this must run first.
  text = injectNewlines(text)

  // ── 1. Backslash normalization (must run before delimiter normalization) ─────
  text = text.replace(/\\\*/g, '\\cdot')         // \* → \cdot  (AI sometimes uses \* for multiply)
  text = text.replace(/\\\\boxed/g, '\\boxed')   // \\boxed → \boxed  (double-escaped)

  // ── 2. Normalize delimiter variants ─────────────────────────────────────────
  // \(...\) → $...$  (inline, single-line only)
  text = text.replace(/\\\(([^\n]*?)\\\)/g, '$$$1$$')
  // \[...\] → $$..$$  (block, may span multiple lines)
  text = text.replace(/\\\[([^]*?)\\\]/g, '$$$$$1$$$$')

  // ── 3. Strip equation-numbering labels from inside math ─────────────────────
  // AI writes:  $$ x^2 + y = 5 \quad (1) $$
  // Result:     $$ x^2 + y = 5 $$
  text = text.replace(/\\quad\s*\(\s*\d+\s*\)/g, '')

  // ── 3b. Wrap bare LaTeX math lines that are missing $$ delimiters ────────────
  // AI sometimes writes equations without delimiters, e.g.:
  //   "9 = 4a + 2b + c \tag{2}"   ← \tag signals it's math
  //   "x = \frac{-b}{2a}"         ← \frac without $ is always a mistake
  // Detection: line contains a math-only command AND has no $ at all.
  // \tag{} is stripped (KaTeX-unsupported) before wrapping.
  // Guard: skip lines with Korean text, [ANSWER]/[GRAPH] tags, or existing $.
  const BARE_MATH_CMD = /\\(frac|sqrt|cdot|times|pm|leq|geq|neq|infty|sum|int|prod|lim|tag|binom|over|underbrace|overbrace|vec|hat|bar|tilde)\b/
  text = text.split('\n').map(line => {
    const t = line.trim()
    if (!t || t.includes('$') || /[가-힣]/.test(t)) return line
    if (t.startsWith('[') || t.startsWith('//') || t.startsWith('#')) return line
    if (BARE_MATH_CMD.test(t)) {
      const clean = t.replace(/\\tag\{[^}]*\}/g, '').trim()
      return clean ? `$$${clean}$$` : ''
    }
    return line
  }).join('\n')

  // ── 4. Split mixed lines: "Korean text $$ math expr" → two separate lines ───
  // Handles the pattern where the AI puts a label and a block equation on the same line.
  // Example: "두 번째 방정식: $$ 4a + 2b = 9"
  //       →  "두 번째 방정식:"  +  "\n$$ 4a + 2b = 9$$"
  text = text.split('\n').flatMap(line => {
    const ddIdx = line.indexOf('$$')
    if (ddIdx <= 0) return [line]                      // no $$ or already at column 0
    const before = line.slice(0, ddIdx).trim()
    const after  = line.slice(ddIdx).trim()
    if (!before) return [line]
    // Only split when Korean characters appear before the $$ — avoids false splits
    if (!/[가-힣]/.test(before)) return [line]
    // If the math block is unclosed (odd number of $$), close it
    const ddCount = (after.match(/\$\$/g) || []).length
    const mathPart = ddCount % 2 === 1 ? after + '$$' : after
    return [before, mathPart]
  }).join('\n')

  // ── 5. Collapse $$ immediately followed by Korean text ───────────────────────
  // AI sometimes writes "$$이다" meaning the block ended and Korean text follows.
  text = text.replace(/\$\$\s*([가-힣])/g, ' $1')

  // ── 6. Remove lone dangling $$ at end of a line with no matching opener ──────
  text = text.split('\n').map(line => {
    const ddCount = (line.match(/\$\$/g) || []).length
    if (ddCount === 1 && line.trimEnd().endsWith('$$')) {
      return line.trimEnd().slice(0, -2).trimEnd()
    }
    return line
  }).join('\n')

  // ── 7. Sentence-boundary spacing: period immediately before Korean ───────────
  // Only outside math delimiters so "$1.5$" is never altered
  text = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/).map((seg, idx) =>
    idx % 2 === 0 ? seg.replace(/\.([가-힣])/g, '. $1') : seg
  ).join('')

  return text
}

// ─── postprocessAIResponse ───────────────────────────────────────────────────
/**
 * Structural postprocessor — runs on every AI response before SolutionRenderer
 * parses it. Fixes formatting problems that the AI consistently produces despite
 * prompt instructions:
 *
 *  1. Remove \quad (used to attach labels or spacing inside equations)
 *  2. Remove \tag{} (KaTeX-unsupported, appears as raw text)
 *  3. Split any line that mixes Korean text and $$ on the same line
 *  4. Ensure blank lines above and below every $$ block
 *  5. Collapse 3+ consecutive newlines to 2
 *  6. Convert [ANSWER]...[/ANSWER] to display math $$...$$
 */
export function postprocessAIResponse(text) {
  if (!text) return text
  let t = text

  // 1. Strip \quad (spacing/label hack) and \tag{} (equation numbering) everywhere
  t = t.replace(/\\quad\s*/g, ' ')
  t = t.replace(/\\tag\{[^}]*\}/g, '')

  // 2. Split lines where Korean text and a $$...$$ block share the same line.
  //    Uses a function callback to avoid $$ replacement-string escaping pitfalls.
  t = t.split('\n').map(line => {
    if (/[가-힣]/.test(line) && /\$\$/.test(line)) {
      return line.replace(/\$\$([^$]+)\$\$/g, (_, math) => `\n\n$$${math.trim()}$$\n\n`)
    }
    return line
  }).join('\n')

  // 3. Ensure a blank line BEFORE any $$ that directly follows non-blank text
  t = t.replace(/([^\n])\n(\$\$)/g, '$1\n\n$2')

  // 4. Ensure a blank line AFTER any $$ that is directly followed by non-blank text
  t = t.replace(/(\$\$)\n([^\n$])/g, '$1\n\n$2')

  // 5. Collapse 3+ newlines to exactly 2
  t = t.replace(/\n{3,}/g, '\n\n')

  // 6. Convert [ANSWER]...[/ANSWER] to standalone display math.
  //    Uses function callback so the captured content is interpolated safely.
  t = t.replace(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/g, (_, content) => `\n\n$$${content.trim()}$$\n\n`)

  return t
}

// ─── stripDanglingMarkdown ────────────────────────────────────────────────────
/**
 * Remove incomplete markdown artifacts from cut-off streaming responses.
 */
export function stripDanglingMarkdown(text) {
  if (!text) return text
  let t = text.trimEnd()
  t = t.replace(/\*{1,2}$/, '')
  t = t.replace(/__$/, '')
  t = t.replace(/#{1,4}\s*$/, '')
  t = t.replace(/\$\$$/, '')
  t = t.replace(/(?<!\$)\$$/, '')
  t = t.replace(/`$/, '')
  return t.trimEnd()
}

// ─── renderLatexInline ────────────────────────────────────────────────────────
/**
 * Render a single pure-LaTeX string as INLINE math HTML.
 * Input: raw LaTeX without delimiters (e.g. "x^2 + y^2")
 * Output: HTML string. Never throws. Never shows red error text.
 */
export function renderLatexInline(latex) {
  return renderSafe(latex, false)
}

/**
 * Render a single pure-LaTeX string as DISPLAY (block) math HTML.
 * Input: raw LaTeX without delimiters (e.g. "\\frac{-b \\pm \\sqrt{D}}{2a}")
 * Output: HTML string. Never throws. Never shows red error text.
 */
export function renderLatexDisplay(latex) {
  return renderSafe(latex, true)
}

// Backward-compatible alias
export function renderDisplay(latex) { return renderLatexDisplay(latex) }

// ─── renderInline ─────────────────────────────────────────────────────────────
/**
 * Render a MIXED string (Korean + math + markdown) to an HTML string.
 * Handles: **bold**, *italic*, $inline math$, $$display math$$, [ANSWER]...[/ANSWER]
 *
 * This is the main function for rendering AI chat content.
 * ALL mixed-text rendering in the app must use this function.
 */
export function renderInline(text) {
  if (!text) return ''

  // Local normalization for individual snippets (defensive — full responses go
  // through sanitizeAIResponse first, but this catches anything that didn't).
  text = text.replace(/\\n/g, ' ')
  text = text.replace(/\s*\$\$\s*이다\.?/g, ' 이다.')
  text = text.replace(/\s*\$\$\s*$/g, '')
  text = text.replace(/\\\(([^\n]*?)\\\)/g, '$$$1$$')
  text = text.replace(/\\\[([^]*?)\\\]/g, '$$$$$1$$$$')
  text = text.replace(/\\\*/g, '\\cdot')
  text = text.replace(/\\\\boxed/g, '\\boxed')
  text = text.replace(/\\quad\s*\(\s*\d+\s*\)/g, '')   // strip equation labels

  // Convert \boxed answers to highlight markers
  text = text.replace(/\$\$\\boxed\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\$\$/g, '[ANSWER]$1[/ANSWER]')
  text = text.replace(/\$\\boxed\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\$/g, '[ANSWER]$1[/ANSWER]')

  text = autoWrapMath(text)

  const re = /\[ANSWER\]([\s\S]+?)\[\/ANSWER\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|\$\$([\s\S]+?)\$\$|\$((?:[^$\n\\]|\\.)+?)\$/g
  let result = ''
  let lastIndex = 0
  let m

  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) result += esc(text.slice(lastIndex, m.index))

    if (m[1] !== undefined) {
      // [ANSWER] highlight box
      const html = renderLatexInline(m[1].trim())
      result += `<span style="display:inline-block;padding:4px 12px;background:#F0F4FF;border:2px solid #4F7EFF;border-radius:6px;font-weight:700">${html}</span>`
    } else if (m[2] !== undefined) {
      // **bold** — recurse so bold can contain math
      result += `<strong>${renderInline(m[2])}</strong>`
    } else if (m[3] !== undefined) {
      // *italic*
      result += `<em>${renderInline(m[3])}</em>`
    } else if (m[4] !== undefined) {
      // $$display$$ rendered inline with display style
      const html = renderLatexDisplay(m[4].trim())
      result += `<span style="display:inline-block;margin:4px 0">${html}</span>`
    } else {
      // $inline$
      result += renderLatexInline(m[5].trim())
    }
    lastIndex = re.lastIndex
  }

  if (lastIndex < text.length) result += esc(text.slice(lastIndex))
  return result
}

/**
 * React component: render a mixed text+math string as a <span>.
 * Use this instead of dangerouslySetInnerHTML + renderInline at every call site.
 */
export function Inline({ text }) {
  return React.createElement('span', {
    dangerouslySetInnerHTML: { __html: renderInline(text || '') }
  })
}

// ─── Legacy exports (backward-compatible — do not remove) ─────────────────────

/**
 * Render a pure LaTeX string (no delimiters) in display or inline mode.
 * Legacy function — prefer renderLatexInline / renderLatexDisplay for new code.
 */
export function renderLatex(latex, displayMode = false) {
  if (!latex) return ''
  return displayMode ? renderLatexDisplay(latex) : renderLatexInline(latex)
}

/**
 * Render mixed text that may contain $$...$$ and $...$ delimiters.
 * Legacy function — for new AI chat rendering use renderInline instead,
 * which additionally handles bold, italic, [ANSWER] boxes, and backslash restoration.
 */
export function renderMixedLatex(text) {
  if (!text) return ''
  const parts = []
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let lastIndex = 0
  let match
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(esc(text.slice(lastIndex, match.index)))
    if (match[1] !== undefined) {
      parts.push(`<span class="math-display-wrap">${renderLatexDisplay(match[1].trim())}</span>`)
    } else {
      parts.push(renderLatexInline(match[2].trim()))
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(esc(text.slice(lastIndex)))
  return parts.join('')
}

// Keep renderInlineLatex as an alias so existing imports don't break
export function renderInlineLatex(text) { return renderMixedLatex(text) }
