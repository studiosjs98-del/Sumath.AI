/**
 * Generate plausible multiple-choice wrong answers (distractors)
 * for a given math problem answer. Deterministic – no AI needed.
 */

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

function generateDistractors(answerLatex) {
  if (!answerLatex) return ['$1$', '$2$', '$3$']
  const raw = answerLatex.replace(/^\$+|\$+$/g, '').trim()

  // --- Pure integer ---
  const intMatch = raw.match(/^(-?\d+)$/)
  if (intMatch) {
    const n = parseInt(raw)
    const deltas = [-3, -2, -1, 1, 2, 3, 4, -4, 5, -5]
    const cands = []
    for (const d of deltas) {
      if (!cands.includes(n + d)) cands.push(n + d)
      if (cands.length === 3) break
    }
    return cands.map(v => `$${v}$`)
  }

  // --- Decimal ---
  const decMatch = raw.match(/^(-?\d+\.\d+)$/)
  if (decMatch) {
    const n = parseFloat(raw)
    return [`$${(n + 0.5).toFixed(1)}$`, `$${(n - 0.5).toFixed(1)}$`, `$${(n * 2).toFixed(1)}$`]
  }

  // --- Equation: x = n ---
  const eqMatch = raw.match(/^([a-zA-Z])\s*=\s*(-?\d+(?:\.\d+)?)$/)
  if (eqMatch) {
    const [, vr, numStr] = eqMatch
    const n = parseFloat(numStr)
    const ints = [n - 1, n + 1, -n].filter(v => v !== n)
    return ints.slice(0, 3).map(v => `$${vr} = ${v}$`)
  }

  // --- Two solutions: x = a 또는 x = b ---
  const dualMatch = raw.match(/^([a-zA-Z])\s*=\s*(-?\d+)\s*(?:또는|or|,)\s*([a-zA-Z])\s*=\s*(-?\d+)$/)
  if (dualMatch) {
    const [, v, a, , b] = dualMatch
    const na = parseInt(a), nb = parseInt(b)
    return [
      `$${v} = ${na + 1}$ 또는 $${v} = ${nb - 1}$`,
      `$${v} = ${na - 1}$ 또는 $${v} = ${nb + 1}$`,
      `$${v} = ${na}$ 또는 $${v} = ${nb + 2}$`
    ]
  }

  // --- Fraction: \frac{a}{b} or \dfrac{a}{b} ---
  const fracMatch = raw.match(/\\d?frac\{(-?\d+)\}\{(\d+)\}/)
  if (fracMatch) {
    const num = parseInt(fracMatch[1]), den = parseInt(fracMatch[2])
    const type = raw.includes('dfrac') ? '\\dfrac' : '\\frac'
    return [
      `$${type}{${num + 1}}{${den}}$`,
      `$${type}{${num}}{${den + 1}}$`,
      `$${type}{${num - 1}}{${den}}$`
    ]
  }

  // --- Degree angles ---
  if (raw.includes('°')) {
    const degMatch = raw.match(/(-?\d+)°/)
    if (degMatch) {
      const n = parseInt(degMatch[1])
      const alts = [30, 45, 60, 90, 120, 135, 150, 180].filter(v => v !== n)
      return alts.slice(0, 3).map(v => `$${v}°$`)
    }
  }

  // --- Percentage ---
  if (raw.endsWith('%')) {
    const pMatch = raw.match(/(-?\d+(?:\.\d+)?)%/)
    if (pMatch) {
      const n = parseFloat(pMatch[1])
      return [`$${n - 5}\\%$`, `$${n + 5}\\%$`, `$${n + 10}\\%$`]
    }
  }

  // --- Default: return simple number alternatives ---
  return ['$3$', '$5$', '$8$']
}

/**
 * Build full MC options object for a problem.
 * Returns { options: string[4], correctIndex: number }
 * Options are shuffled deterministically by problemId.
 */
function buildMcOptions(problemId, answerLatex) {
  const distractors = generateDistractors(answerLatex)
  const allOptions = [answerLatex, ...distractors.slice(0, 3)]
  const shuffled = shuffleWithSeed(allOptions, problemId || 1)
  const correctIndex = shuffled.indexOf(answerLatex)
  return { options: shuffled, correctIndex: correctIndex >= 0 ? correctIndex : 0 }
}

module.exports = { buildMcOptions, generateDistractors }
