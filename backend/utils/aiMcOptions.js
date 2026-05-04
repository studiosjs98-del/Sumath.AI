/**
 * AI-powered multiple choice distractor generator.
 * Uses Claude to produce type-matched, pedagogically meaningful wrong answers.
 * Falls back to rule-based generation if AI is unavailable.
 */

const Groq = require('groq-sdk')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Seeded shuffle — keeps option order stable for the same problem
function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}
function shuffleWithSeed(arr, seed) {
  const a = [...arr]
  const rand = seededRand(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Generate 3 plausible distractors via Claude Haiku.
 * Returns an array of 3 LaTeX strings.
 */
async function generateAiDistractors(problem) {
  const { question_latex, answer_latex, topic, grade, curriculum } = problem

  const prompt = `You are creating multiple choice distractors for a Korean math problem.

Problem: ${question_latex}
Correct answer: ${answer_latex}
Topic: ${topic || ''}, Grade: ${grade || ''}, Curriculum: ${curriculum || ''}

Rules:
1. Generate EXACTLY 3 wrong answer options
2. They MUST be the same TYPE as the correct answer:
   - If the answer is a factored expression like (x+5)(x-3), all options must be factored expressions
   - If the answer is an equation like x=7, all options must be equations
   - If the answer is a fraction, all options must be fractions
   - If the answer is a number, options must be nearby numbers
   - NEVER mix types (e.g., never put numbers when the answer is an expression)
3. Each wrong option must represent a SPECIFIC common student mistake:
   - Sign errors: mixing + and - signs
   - Coefficient errors: off by one factor
   - Partial completion: stopping one step too early
   - Common misconceptions for this topic
4. Options must look genuinely plausible — a student must understand the math to eliminate them
5. Use IDENTICAL LaTeX formatting style as the correct answer (same delimiters, same commands)

Return ONLY a valid JSON array of exactly 3 strings. No explanation, no markdown, no extra text.
Example: ["$(x-5)(x+3)$", "$(x+5)(x+3)$", "$(x-5)(x-3)$"]`

 const response = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  })

 const text = response.choices[0].message.content.trim()

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) throw new Error('No JSON array in AI response')

  const distractors = JSON.parse(match[0])
  if (!Array.isArray(distractors) || distractors.length < 3) {
    throw new Error('AI returned fewer than 3 distractors')
  }

  // Sanity check: none should equal the correct answer
  const clean = (s) => s.replace(/\s+/g, '').toLowerCase()
  const cleanAnswer = clean(answer_latex || '')
  const valid = distractors
    .slice(0, 3)
    .filter(d => clean(d) !== cleanAnswer)

  if (valid.length < 3) throw new Error('AI distractors overlap with correct answer')

  return valid
}

/**
 * Rule-based fallback — much better than the original, handles more types
 */
function ruleBasedDistractors(answerLatex) {
  const raw = (answerLatex || '').replace(/^\$+|\$+$/g, '').trim()

  const wrap = (s) => {
    const hadDollar = answerLatex && (answerLatex.startsWith('$') || answerLatex.startsWith('\\('))
    return hadDollar ? `$${s}$` : s
  }

  // Integer
  const intMatch = raw.match(/^(-?\d+)$/)
  if (intMatch) {
    const n = parseInt(raw)
    const opts = []
    for (const d of [-2, 2, -1, 1, -3, 3, 4, -4]) {
      const v = n + d
      if (v !== n && !opts.includes(v)) opts.push(v)
      if (opts.length === 3) break
    }
    return opts.map(v => wrap(String(v)))
  }

  // x = n  (equation)
  const eqMatch = raw.match(/^([a-zA-Z])\s*=\s*(-?\d+(?:\.\d+)?)$/)
  if (eqMatch) {
    const [, v, numStr] = eqMatch
    const n = parseFloat(numStr)
    return [wrap(`${v} = ${n + 1}`), wrap(`${v} = ${n - 1}`), wrap(`${v} = ${-n}`)]
  }

  // x = a 또는 x = b
  const dualMatch = raw.match(/^([a-zA-Z])\s*=\s*(-?\d+)\s*(?:또는|or)\s*\1\s*=\s*(-?\d+)$/)
  if (dualMatch) {
    const [, v, a, b] = dualMatch
    const na = parseInt(a), nb = parseInt(b)
    return [
      wrap(`${v} = ${na + 1} 또는 ${v} = ${nb - 1}`),
      wrap(`${v} = ${na - 1} 또는 ${v} = ${nb + 1}`),
      wrap(`${v} = ${na} 또는 ${v} = ${nb + 2}`)
    ]
  }

  // Fraction
  const fracMatch = raw.match(/\\d?frac\{(-?\d+)\}\{(\d+)\}/)
  if (fracMatch) {
    const num = parseInt(fracMatch[1]), den = parseInt(fracMatch[2])
    const t = raw.includes('dfrac') ? '\\dfrac' : '\\frac'
    return [
      wrap(`${t}{${num + 1}}{${den}}`),
      wrap(`${t}{${num}}{${den + 1}}`),
      wrap(`${t}{${num - 1}}{${den}}`)
    ]
  }

  // Decimal
  const decMatch = raw.match(/^(-?\d+\.\d+)$/)
  if (decMatch) {
    const n = parseFloat(raw)
    return [wrap(`${(n + 0.5).toFixed(1)}`), wrap(`${(n - 0.5).toFixed(1)}`), wrap(`${(n * 2).toFixed(1)}`)]
  }

  // Last resort: return plausible-sounding variants by wrapping the answer with tweaks
  // (still better than the hardcoded 3, 5, 8)
  return [wrap(`${raw} + 1`), wrap(`${raw} - 1`), wrap(`2(${raw})`)]
}

/**
 * Main export: generates MC options for a problem.
 * Tries AI first, falls back to rule-based.
 * Returns { options: string[4], correctIndex: number }
 */
async function buildMcOptionsAsync(problem) {
  const { id, answer_latex } = problem
  let distractors

  try {
    distractors = await generateAiDistractors(problem)
  } catch (err) {
    console.warn(`[MC] AI generation failed for problem ${id}, using fallback:`, err.message)
    distractors = ruleBasedDistractors(answer_latex)
  }

  const allOptions = [answer_latex, ...distractors.slice(0, 3)]
  const shuffled = shuffleWithSeed(allOptions, id || 1)
  const correctIndex = shuffled.indexOf(answer_latex)

  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  }
}

module.exports = { buildMcOptionsAsync, ruleBasedDistractors, shuffleWithSeed }
