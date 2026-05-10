const express = require('express');
const openai = require('../services/openaiClient');
const { wolframShortAnswer } = require('../services/wolframClient');
const { authenticate } = require('./middleware');
const { getLanguageInstruction } = require('../utils/language');

const router = express.Router();

// ── Time-budget helpers ────────────────────────────────────────────────────
// `sleep(ms)` resolves after the given duration. `withTimeout(promise, ms,
// fallback)` races a promise against a deadline; on timeout it returns the
// fallback (default null) and the underlying promise keeps running detached
// (its eventual resolution is discarded). Used to enforce per-phase budgets
// so a slow OCR / classify / Wolfram / solver call cannot block the whole
// pipeline past the visible-generation deadline.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise, ms, fallback = null) =>
  Promise.race([promise, sleep(ms).then(() => fallback)]);

// ── Token budgets per difficulty ───────────────────────────────────────────
// Applied to every solver / tutor / warm-start call so reasoning models have
// enough room to actually finish complex case analyses. Helpers like
// classify / decompose / verifier keep their own small caps — they're
// micro-tasks, not solving.
const MAX_TOKENS = {
  easy: 4000,
  medium: 8000,
  hard: 16000,
  olympiad: 32000
};
const DEFAULT_MAX_TOKENS = 16000;
const tokensFor = (difficulty) =>
  (difficulty && MAX_TOKENS[difficulty]) || DEFAULT_MAX_TOKENS;

// ── Incomplete-solution signal phrases ─────────────────────────────────────
// If a raw solver output ends without a final answer and contains any of
// these phrases, we trigger a one-shot solver retry to complete the work.
const INCOMPLETE_SIGNALS = [
  '여기까지',
  'to be continued',
  '계속',
  'therefore we need to',
  '따라서 우리는',
  'we still need to check',
  '아직 확인이 필요'
];
const hasIncompleteSignal = (text) => {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return INCOMPLETE_SIGNALS.some(sig => lower.includes(sig.toLowerCase()));
};

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) return text.slice(startArr, endArr + 1);
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) return text.slice(startObj, endObj + 1);
  return null;
}

function safeParseJson(text) {
  // Pre-escape single backslash before any letter (LaTeX commands like \cdot, \frac, etc.)
  // that would otherwise be stripped or corrupted by JSON.parse.
  // Use negative lookbehind to avoid double-escaping already-escaped sequences.
  const preFixed = text.replace(/(?<!\\)\\([a-zA-Z])/g, '\\\\$1');
  try {
    return JSON.parse(preFixed);
  } catch(e) {
    console.warn('[safeParseJson] first parse failed:', e.message);
    try {
      const fixed = preFixed.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(fixed);
    } catch(e2) {
      console.warn('[safeParseJson] second parse failed:', e2.message);
      try {
        const match = preFixed.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
      } catch(e3) {
        console.warn('[safeParseJson] third parse failed:', e3.message);
      }
      return null;
    }
  }
}


const SYSTEM_PROMPT = `You are a Korean math tutor. You receive a raw rigorous solution from a separate solver and rewrite it as a clear structured explanation in Korean 존댓말.

══════════════════════════════════════════════
OUTPUT FORMAT — strictly required, no exceptions
══════════════════════════════════════════════

Every response MUST follow this exact structure. The first non-empty line of your output must be the literal text "핵심 아이디어".

핵심 아이디어
[One Korean sentence summarizing the key technique or insight used. 존댓말.]

① [Korean step title]
[Brief Korean explanation, 1-2 sentences in 존댓말.]

$$[equation in LaTeX]$$

[Apply the formula to the problem in Korean, 1-2 sentences.]

② [Korean step title]
[One Korean sentence connecting this step to the previous one — what we do next and why.]

$$[equation]$$

[Result in Korean.]

③ [Korean step title]
[Brief Korean explanation, 1-2 sentences.]

$$[equation and result]$$

④ 검산
[One Korean sentence stating that we substitute back to verify.]

$$[verification by substitution]$$

[ANSWER]value[/ANSWER]

여기까지 괜찮아?

══════════════════════════════════════════════
ABSOLUTE TAG RULES — these are non-negotiable
══════════════════════════════════════════════

- Open with the literal Korean text "핵심 아이디어" on its own line.
- Every solution step MUST start with one of: ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ followed by a Korean title.
- NEVER use plain numbered lists (1. 2. 3.) outside of these step blocks.
- NEVER use markdown headers (#, ##, ###) or markdown bold (**, __).
- The final answer MUST appear on its own line as exactly: [ANSWER]value[/ANSWER]
  - "value" is the raw LaTeX answer with no surrounding $ delimiters.
  - Example: [ANSWER]x = 5[/ANSWER] or [ANSWER]a = -2,\\ a = 3[/ANSWER]
- The very last line of your response MUST be exactly: 여기까지 괜찮아?
- A response without all four required tags (핵심 아이디어, ① ② ③ ④ steps, [ANSWER]…[/ANSWER], 여기까지 괜찮아?) is wrong.

══════════════════════════════════════════════
LANGUAGE RULES
══════════════════════════════════════════════

- Write entirely in Korean 존댓말 (~습니다 / ~합니다 endings).
- NEVER output English sentences in the user-facing response.
- NEVER output raw protocol scaffolding from the solver (e.g. "STEP 1 — READ THE PROBLEM EXACTLY"). Translate and reformat the mathematical content only.
- Math: inline as $x$ or $a$, display as $$...$$. Never use \\(...\\) or \\[...\\].

══════════════════════════════════════════════
MATHEMATICAL FIDELITY — never alter the math
══════════════════════════════════════════════

- NEVER alter equations. NEVER simplify expressions. NEVER recompute values. The raw solution has already been verified — your job is ONLY to explain, format, and translate tone.
- Never skip a case that the raw solution opened.
- Never state a conclusion without showing the verification step.
- If the raw solution is incomplete, state the final answer based on the work shown rather than leaving it open.

COMPLETION RULES — these are mandatory:
- Never truncate the solution.
- Every case that was opened must be closed with a result.
- The [ANSWER] tag must always appear before 여기까지 괜찮아?.
- A response without [ANSWER] is always wrong.`;

function buildSystemPrompt(grade, weakTopics) {
  const gradeStr = grade || '고등학교';
  const weakStr = weakTopics && weakTopics.length > 0
    ? weakTopics.map(t => t.topic || t).join(', ')
    : '없음';
  return `${SYSTEM_PROMPT}

Student info:
- Grade level: ${gradeStr}
- Weak topics: ${weakStr}`;
}

function extractMathQuery(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return null;
  const content = typeof lastUser.content === 'string'
    ? lastUser.content
    : lastUser.content?.[0]?.text || '';
  const mathPatterns = /[\d\+\-\*\/\=\^\√\(\)\[\]x]|풀|계산|구하|방정식|함수|미분|적분|수열|확률/;
  return mathPatterns.test(content) ? content : null;
}

function buildOaiMessages(systemPrompt, messages) {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      if (m.imageBase64 && m.role === 'user') {
        return {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${m.imageMimeType || 'image/jpeg'};base64,${m.imageBase64}` } },
            { type: 'text', text: m.content || '이 수학 문제를 풀어주세요.' }
          ]
        };
      }
      return {
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content?.[0]?.text || ''
      };
    })
  ];
}

// Streaming path — gpt-4o-mini only
async function streamOpenAI(systemPrompt, messages, res, model = 'gpt-4o-mini', maxTokens = DEFAULT_MAX_TOKENS) {
  const oaiMessages = buildOaiMessages(systemPrompt, messages);

  const stream = await openai.chat.completions.create(
    {
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      stream: true,
      messages: oaiMessages,
    },
    { timeout: 120000 }
  );

  // Keep-alive comments prevent proxy/client timeouts during slow streaming.
  let keepAliveTimer = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch (_) { clearInterval(keepAliveTimer) }
  }, 15000);

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }
  } finally {
    clearInterval(keepAliveTimer);
  }
}

// ── Phase 1: OCR — extract math problem from image into LaTeX ────────────────
// Non-streaming gpt-4o vision call that converts an image into a LaTeX-only
// problem statement so the solver can run on text. Logs timing and the first
// 300 characters of the extracted LaTeX.
async function ocrExtract(message) {
  const t0 = Date.now();
  console.log('[phase1-ocr] start');

  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o',
      max_tokens: 1500,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are an OCR system specialized in mathematical notation. Extract the math problem from the user-supplied image into LaTeX exactly as it appears. Preserve every symbol, fraction, exponent, subscript, integral, sum, root, and operator. Do NOT solve, do NOT explain, do NOT add commentary. If any character or expression is unreadable or ambiguous, mark that part with [?]. Return ONLY the LaTeX (no surrounding prose, no markdown code fences).'
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${message.imageMimeType || 'image/jpeg'};base64,${message.imageBase64}`
              }
            },
            {
              type: 'text',
              text:
                message.content && message.content !== '(이미지)'
                  ? message.content
                  : 'Extract the math problem from this image as LaTeX only.'
            }
          ]
        }
      ]
    },
    { timeout: 60000 }
  );

  const latex = (response.choices[0]?.message?.content || '').trim();
  const ms = Date.now() - t0;
  console.log(`[phase1-ocr] done in ${ms}ms — extracted: ${JSON.stringify(latex.slice(0, 300))}`);
  return latex;
}

// ── Phase 1: LaTeX normalization (string-only, no API call) ─────────────────
// Conservative cleanup that runs on the OCR output. Fixes the most common
// rendering / reasoning hazards without trying to balance arbitrary expressions:
//   - strip markdown code fences
//   - convert \(...\) → $...$  and \[...\] → $$...$$
//   - wrap bare |x| absolute values in \left|...\right| so KaTeX renders right
//   - collapse leading/trailing whitespace
function normalizeLatex(latex) {
  if (!latex || typeof latex !== 'string') return '';
  let s = latex.trim();

  // Strip markdown code fences (```latex / ```math / ```tex / ```).
  s = s.replace(/^```(?:latex|math|tex)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

  // \(...\) → $...$
  s = s.replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, '$$$1$$');
  // \[...\] → $$...$$
  s = s.replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, '$$$$$1$$$$');

  // Wrap bare |...| absolute values in \left|...\right|. Only single-line,
  // non-empty content, and not already wrapped. Skips bars that look like
  // LaTeX math-mode set-builder pipes by requiring at least one alphanumeric.
  s = s.replace(/(?<!\\left)\|([^|\n]*[A-Za-z0-9][^|\n]*?)\|(?!\\right)/g, '\\left|$1\\right|');

  return s.trim();
}

// ── Phase 2: classify topic and difficulty ─────────────────────────────────
// Non-streaming gpt-4o-mini call. Returns { topic, difficulty, needs_casework,
// is_multi_part } with all fields constrained to known values. On failure,
// defaults to algebra/medium/false/false so the pipeline never crashes.
const VALID_TOPICS = ['algebra', 'calculus', 'geometry', 'trigonometry', 'probability', 'number theory', 'olympiad'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'olympiad'];

async function classifyProblem(problemText) {
  const t0 = Date.now();
  console.log('[phase2-classify] start');

  let topic = 'algebra';
  let difficulty = 'medium';
  let needs_casework = false;
  let is_multi_part = false;

  try {
    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You classify math problems. Respond with ONLY a JSON object containing four fields: "topic" (one of: algebra, calculus, geometry, trigonometry, probability, number theory, olympiad), "difficulty" (one of: easy, medium, hard, olympiad), "needs_casework" (boolean — true if the problem requires breaking into cases such as |x| or piecewise functions or discriminant cases), and "is_multi_part" (boolean — true if the problem has multiple labeled subparts like (a)(b)(c) or 1)2)3)). No prose, no markdown.'
          },
          {
            role: 'user',
            content: `Classify this math problem:\n\n${problemText}`
          }
        ]
      },
      { timeout: 30000 }
    );

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const t = String(parsed.topic || '').toLowerCase().trim();
    const d = String(parsed.difficulty || '').toLowerCase().trim();
    if (VALID_TOPICS.includes(t)) topic = t;
    if (VALID_DIFFICULTIES.includes(d)) difficulty = d;
    if (typeof parsed.needs_casework === 'boolean') needs_casework = parsed.needs_casework;
    if (typeof parsed.is_multi_part === 'boolean') is_multi_part = parsed.is_multi_part;
  } catch (err) {
    console.warn('[phase2-classify] failed, using defaults:', err.message || err);
  }

  const ms = Date.now() - t0;
  console.log(`[phase2-classify] done in ${ms}ms — topic: ${topic}, difficulty: ${difficulty}, casework: ${needs_casework}, multi_part: ${is_multi_part}`);
  return { topic, difficulty, needs_casework, is_multi_part };
}

// ── Phase 2: decompose into ordered subproblems ────────────────────────────
// Non-streaming gpt-4o-mini call. Returns an array of subproblem strings
// (max 5). Empty array on failure or non-array response.
async function decomposeProblem(problemText) {
  const t0 = Date.now();
  console.log('[phase2-decompose] start');

  let steps = [];
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        max_tokens: 600,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Break this math problem into a list of logical subproblems that must be solved in order. Return ONLY a JSON object of the shape {"steps": ["...", "...", ...]} with at most 5 short string entries. Each entry is one subproblem to solve in order. No prose.'
          },
          { role: 'user', content: problemText }
        ]
      },
      { timeout: 30000 }
    );
    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.steps) ? parsed.steps : (Array.isArray(parsed) ? parsed : []);
    steps = arr.slice(0, 5).map(s => String(s || '').trim()).filter(Boolean);
  } catch (err) {
    console.warn('[phase2-decompose] failed:', err.message || err);
  }

  const ms = Date.now() - t0;
  console.log(`[phase2-decompose] done in ${ms}ms — ${steps.length} subproblem(s): ${JSON.stringify(steps).slice(0, 300)}`);
  return steps;
}

// ── Phase 4: warm-start solver (hard / olympiad only) ─────────────────────
// o4-mini with reasoning_effort: "medium". Launched after classification so
// it's only paid for on hard/olympiad. Runs without Wolfram grounding (the
// route's wolfram lookup is concurrent); the background verifier catches
// errors after the response is already streaming.
async function warmStartSolver(problemText, maxTokens = DEFAULT_MAX_TOKENS) {
  const t0 = Date.now();
  console.log(`[phase4-warmstart] start (o4-mini, reasoning_effort: medium, maxTokens: ${maxTokens})`);

  let solution = null;
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'o4-mini',
        max_completion_tokens: maxTokens,
        reasoning_effort: 'medium',
        messages: [
          { role: 'system', content: SOLVER_PROMPT },
          { role: 'user', content: `Problem:\n${problemText}\n\nProduce a rigorous step-by-step solution. Double-check your work.` }
        ]
      },
      { timeout: 120000 }
    );
    solution = response.choices[0]?.message?.content || '';
  } catch (err) {
    console.warn('[phase4-warmstart] failed:', err.message || err);
  }

  const ms = Date.now() - t0;
  if (solution) {
    console.log(`[phase4-warmstart] done in ${ms}ms — solution length: ${solution.length} chars`);
  } else {
    console.log(`[phase4-warmstart] done in ${ms}ms — no solution`);
  }
  return solution;
}

// ── Phase 3: safe early streaming ──────────────────────────────────────────
// Streams a structural-analysis intro (topic + approach + ordered subproblems)
// to the client immediately after Phase 2 completes, so the user sees content
// while Phase 4-7 are still cooking. NEVER includes computed roots, equations,
// or final answers — meta-reasoning only.
const TOPIC_KO = {
  'algebra': '대수',
  'calculus': '미적분',
  'geometry': '기하',
  'trigonometry': '삼각함수',
  'probability': '확률',
  'number theory': '정수론',
  'olympiad': '올림피아드'
};
const DIFFICULTY_KO = { easy: '쉬움', medium: '중간', hard: '어려움', olympiad: '올림피아드' };
// Topic-specific approach hints — fixed Korean strings, never derived from
// model output, so no English / prompt-content can leak through.
const APPROACH_BY_TOPIC = {
  'algebra': '식을 정리하고 변수에 대해 풀어 답을 구하겠습니다.',
  'calculus': '도함수를 구하고 임계점과 극값을 분석하여 답을 구하겠습니다.',
  'geometry': '도형의 성질과 좌표를 활용하여 답을 구하겠습니다.',
  'trigonometry': '삼각함수의 항등식과 주기성을 활용하여 답을 구하겠습니다.',
  'probability': '경우의 수를 세어 확률을 계산하겠습니다.',
  'number theory': '수의 성질과 정수의 구조를 분석하여 답을 구하겠습니다.',
  'olympiad': '구조적 통찰을 바탕으로 단계적으로 답을 구하겠습니다.'
};

// Phase 3 — streams a short Korean intro derived ONLY from classification
// (topic + difficulty). Never includes decomposition output (which can come
// back in English) or any other model-generated text. If classification is
// null/unknown, falls back to a single neutral Korean sentence.
async function streamStructuralAnalysis(res, classification /* decomposition unused */) {
  const t0 = Date.now();
  console.log('[phase3-structural] start');

  const knownTopic = classification
    && classification.topic
    && classification.topic !== 'unknown'
    && TOPIC_KO[classification.topic];

  let text;
  if (!knownTopic) {
    text = '문제를 분석하고 있습니다...\n\n';
  } else {
    const topicKo = TOPIC_KO[classification.topic];
    const diffKo = DIFFICULTY_KO[classification.difficulty] || '';
    const approach = APPROACH_BY_TOPIC[classification.topic] || '체계적인 접근으로 답을 구하겠습니다.';
    text = `이 문제는 ${topicKo} 유형의 ${diffKo} 난이도 문제입니다. ${approach}\n\n`;
  }

  try {
    res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
  } catch (writeErr) {
    console.warn('[phase3-structural] write failed:', writeErr.message || writeErr);
  }

  const ms = Date.now() - t0;
  console.log(`[phase3-structural] done in ${ms}ms — streamed ${text.length} chars (knownTopic=${!!knownTopic})`);
}

// ── Phase 3: Wolfram Alpha lookup ──────────────────────────────────────────
// Returns the Wolfram answer string on success or null on failure / no result.
// Wolfram failures are non-fatal — pipeline continues, LLM solves unaided.
async function wolframLookup(problemText) {
  const t0 = Date.now();
  console.log('[phase3-wolfram] start');
  const answer = await wolframShortAnswer(problemText);
  const ms = Date.now() - t0;
  if (answer) {
    console.log(`[phase3-wolfram] done in ${ms}ms — answer: ${JSON.stringify(answer.slice(0, 200))}`);
  } else {
    console.log(`[phase3-wolfram] done in ${ms}ms — no answer (LLM will solve unaided)`);
  }
  return answer;
}

// ── Phase 4: solver prompt (internal, correctness only) ────────────────────
const SOLVER_PROMPT = `You are an elite Korean CSAT and olympiad mathematician.

Your job is to produce a fully rigorous, complete, verified solution.

════════════════════════════════════════════
MANDATORY PROBLEM-SOLVING PROTOCOL
════════════════════════════════════════════

STEP 1 — READ THE PROBLEM EXACTLY
Write out word for word what is being asked.
Identify: what is the unknown, what is the condition, what must be proven.
Do not begin solving until this is written out.

STEP 2 — IDENTIFY THE PROBLEM TYPE
Classify the problem before solving:
- Is this a root-counting problem?
- Is this a composite function problem?
- Is this a parameter problem?
- Does it require graph/geometry analysis?
This determines your solution strategy.

STEP 3 — STRUCTURAL ANALYSIS BEFORE ALGEBRA
For cubic functions: ALWAYS compute f'(x) first.
Find critical points. Compute local max M and local min m explicitly.
This is mandatory before counting any roots.

For absolute value equations: ALWAYS split into two cases with domain check.
Never apply horizontal-line intersection reasoning to a non-horizontal right side.

For composite equations f(f(x)) = 0:
ALWAYS find ALL roots of f(t) = 0 first. Call them r₁, r₂, ..., rₙ.
Then solve f(x) = r₁, f(x) = r₂, ..., f(x) = rₙ as separate equations.
Never skip this reduction step.

STEP 4 — COUNT ROOTS WITH GEOMETRY
For each equation f(x) = c:
Use the local max M and local min m from Step 3.
Apply exactly:
  c > M or c < m  →  1 real solution
  c = M or c = m  →  2 real solutions (one repeated)
  m < c < M       →  3 real solutions
Never guess or assert root counts without this analysis.

STEP 5 — CHECK FOR OVERLAPPING ROOTS
After collecting all solutions across all equations:
Check whether any value appears in more than one equation's solution set.
If two equations share a root, count it only once.
Overlaps must be checked explicitly, never assumed absent.

STEP 6 — PARAMETER ANALYSIS
When the problem asks for values of a parameter a:
Set up the exact algebraic condition that produces the required root count.
Solve for specific values of a.
Never claim an entire interval works.
Never use integration to sum discrete parameter values.
"Sum of all possible values of a" means: find each specific a, then add them.

STEP 7 — VERIFY EVERY CANDIDATE
For each candidate value of a found:
Substitute explicitly into the original function.
Solve every equation f(x) = rᵢ with that specific a.
List every distinct root.
Count them.
Confirm the count matches exactly.
Reject and explain any candidate that fails.

STEP 8 — LOOK FOR ELEGANT STRUCTURE
Before expanding into heavy algebra, ask:
- Is there a substitution that simplifies this?
- Can I shift variables to reveal standard form?
- Does the derivative reveal a pattern?

For example: if f'(x) = 3((x-a)² - 1), the substitution u = x-a
reduces f(x) to the standard cubic u³ - 3u plus a constant.
This kind of structural insight must be pursued before brute-force algebra.

STEP 9 — COMPLETE EVERY CASE
Every case opened must be closed with a result.
Every inequality must be resolved to specific values or a justified range.
Never leave a case as "needs further analysis" without completing it.
A solution framework is not a solution.

STEP 10 — STATE THE FINAL ANSWER CLEARLY
After all cases are verified, state the final answer explicitly.
For "sum of all possible values": add the specific values found.
For "number of solutions": state the count with justification.
For "range of a": state the exact interval with boundary analysis.

════════════════════════════════════════════
WHAT CONSTITUTES A FATAL ERROR
════════════════════════════════════════════

These are unacceptable and make the solution wrong regardless of presentation:

✗ Counting roots without analyzing critical points of the cubic
✗ Asserting root counts without geometric justification
✗ Skipping overlap analysis in composite function problems
✗ Using ∫ to answer "sum of all possible values of a"
✗ Claiming an interval of a works without testing boundary and interior points
✗ Leaving a case analysis incomplete
✗ Guessing the final answer from partial work
✗ Saying "f(f(x))=0 means f(x)=0 or f(x)=c" without specifying all roots of f

════════════════════════════════════════════
EXAMPLE OF CORRECT REASONING PATTERN
════════════════════════════════════════════

Problem type: f(f(x)) = 0 has exactly 5 distinct real roots, find sum of all a.

Correct approach:
1. Factor f(x). Find roots r₁, r₂, r₃ of f(t) = 0.
2. Compute f'(x). Find critical points x = a-1 and x = a+1.
3. Compute M = f(a-1) and m = f(a+1) explicitly.
4. For each rᵢ, determine how many solutions f(x) = rᵢ has using M and m.
5. Add counts, subtract overlaps, set equal to 5.
6. Solve for a. Test each candidate. Verify root count explicitly.
7. Sum the valid values of a.

Wrong approach (never do this):
- Factor f(x), assert "3 roots here + 2 roots there = 5", skip all geometry.
- Compute discriminant, claim interval works, integrate to get sum.
- Set up cases but never complete any of them.`;

// runSolver — non-streaming. Returns the raw solution text.
// `effort` controls reasoning_effort for o-series reasoning models.
// `retryContext` is an optional verifier/consistency note prepended to the
// user message when re-solving after a failure.
// `maxTokens` is the per-difficulty token budget (DEFAULT_MAX_TOKENS = 16000).
async function runSolver(problemText, wolframAnswer, model, effort = 'medium', retryContext = null, maxTokens = DEFAULT_MAX_TOKENS) {
  const t0 = Date.now();
  const isReasoningModel = /^(o3|o3-mini|o4-mini)$/.test(model);
  const effortLevel = isReasoningModel ? effort : 'n/a';
  console.log(`[phase4-solver] start (model: ${model}, reasoning_effort: ${effortLevel}, maxTokens: ${maxTokens}${retryContext ? ', retry: yes' : ''})`);

  const baseUserContent = wolframAnswer
    ? `Problem:\n${problemText}\n\nThe correct final answer is: ${wolframAnswer}\n\nShow the complete working that arrives at this answer. Never produce a solution that contradicts this answer. Produce a rigorous step-by-step solution.`
    : `Problem:\n${problemText}\n\nProduce a rigorous step-by-step solution. Double-check your work.`;

  const userContent = retryContext
    ? `${retryContext}\n\n${baseUserContent}`
    : baseUserContent;

  const params = {
    model,
    messages: [
      { role: 'system', content: SOLVER_PROMPT },
      { role: 'user', content: userContent }
    ]
  };
  if (isReasoningModel) {
    // Reasoning models: no temperature, use max_completion_tokens.
    params.max_completion_tokens = maxTokens;
    params.reasoning_effort = effort;
  } else {
    // Non-reasoning gpt-4o fallback.
    params.max_tokens = maxTokens;
    params.temperature = 0.2;
  }

  const response = await openai.chat.completions.create(params, { timeout: 120000 });
  const solution = response.choices[0]?.message?.content || '';
  const ms = Date.now() - t0;
  console.log(`[phase4-solver] done in ${ms}ms — solution length: ${solution.length} chars`);
  return solution;
}

// ── Phase 5: verifier ──────────────────────────────────────────────────────
// Non-streaming gpt-4o verification of a raw solver solution. Returns
// { ok: bool, reason: string }. ok=true only if the model responds with the
// literal token "VERIFIED" (case-insensitive, possibly with surrounding
// whitespace). Otherwise the response is treated as the error explanation.
async function verifySolution(problemText, rawSolution) {
  const t0 = Date.now();
  console.log('[phase5-verifier] start');

  let ok = false;
  let reason = '';

  try {
    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o',
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a strict mathematical verifier. Check the provided solution against the original problem for: every algebraic step, domain restrictions, edge cases, whether substituting the final answer back satisfies the original equation, missing roots, invalid transformations, and sign errors. If everything is correct, respond with ONLY the single word VERIFIED (uppercase, nothing else). If anything is wrong, respond with a detailed explanation of the error(s) — what is wrong, where, and why. Do not say "VERIFIED" partially or as part of any other text.'
          },
          {
            role: 'user',
            content: `Original problem:\n${problemText}\n\nSolution to verify:\n${rawSolution}`
          }
        ]
      },
      { timeout: 60000 }
    );
    const raw = (response.choices[0]?.message?.content || '').trim();
    if (/^VERIFIED\.?$/i.test(raw)) {
      ok = true;
      reason = '';
    } else {
      ok = false;
      reason = raw;
    }
  } catch (err) {
    console.warn('[phase5-verifier] failed (treating as VERIFIED to avoid blocking):', err.message || err);
    ok = true; // verifier failure should not block the response — fail open
    reason = `verifier-error: ${err.message || err}`;
  }

  const ms = Date.now() - t0;
  console.log(`[phase5-verifier] done in ${ms}ms — ok: ${ok}${reason ? `, reason: ${JSON.stringify(reason.slice(0, 200))}` : ''}`);
  return { ok, reason };
}

// ── Phase 6: alternative-strategy solver (olympiad only) ───────────────────
// Solves the problem with an explicit instruction to use a different method
// (e.g. geometric vs. algebraic). Used to cross-check the primary solution
// for olympiad problems.
async function alternativeStrategySolver(problemText, wolframAnswer, maxTokens = MAX_TOKENS.olympiad) {
  const t0 = Date.now();
  console.log(`[phase6-alt] start (o4-mini, reasoning_effort: medium, maxTokens: ${maxTokens}, alternative strategy)`);

  const wolframLine = wolframAnswer
    ? `\n\nThe correct final answer is: ${wolframAnswer}. Your solution must arrive at this answer.`
    : '';
  const userContent = `Problem:\n${problemText}${wolframLine}\n\nSolve this problem using an ALTERNATIVE METHOD different from the most obvious one. If the problem is naturally algebraic, try a geometric/graphical interpretation. If naturally calculus, try elementary inequalities. If naturally direct, try substitution or transformation. The goal is a fully independent path to the same final answer.`;

  let solution = null;
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'o4-mini',
        max_completion_tokens: maxTokens,
        reasoning_effort: 'medium',
        messages: [
          { role: 'system', content: SOLVER_PROMPT },
          { role: 'user', content: userContent }
        ]
      },
      { timeout: 120000 }
    );
    solution = response.choices[0]?.message?.content || '';
  } catch (err) {
    console.warn('[phase6-alt] failed:', err.message || err);
  }

  const ms = Date.now() - t0;
  console.log(`[phase6-alt] done in ${ms}ms — solution length: ${solution ? solution.length : 0} chars`);
  return solution;
}

// ── Phase 6: compare two solutions ─────────────────────────────────────────
// Asks gpt-4o-mini whether two solutions arrive at the same final answer.
// Returns true on match (or on comparison failure — fail-permissive so we
// don't pointlessly escalate).
async function compareAnswers(solutionA, solutionB) {
  const t0 = Date.now();
  console.log('[phase6-compare] start');

  if (!solutionA || !solutionB) {
    console.log(`[phase6-compare] done in 0ms — one solution missing, treating as match`);
    return true;
  }

  let same = true;
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        max_tokens: 10,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You compare two math solutions and decide whether they arrive at the same final answer (numerical value, set of values, or expression). Respond with ONLY "YES" or "NO". No prose, no punctuation.'
          },
          {
            role: 'user',
            content: `Solution A:\n${solutionA}\n\n---\n\nSolution B:\n${solutionB}`
          }
        ]
      },
      { timeout: 30000 }
    );
    const verdict = (response.choices[0]?.message?.content || '').trim().toUpperCase();
    same = !/^NO\b/.test(verdict);
  } catch (err) {
    console.warn('[phase6-compare] failed (treating as match):', err.message || err);
  }

  const ms = Date.now() - t0;
  console.log(`[phase6-compare] done in ${ms}ms — match: ${same}`);
  return same;
}

// streamTutor — streaming. Reformats raw solution into the existing 존댓말
// step format and writes it as SSE chunks. Accumulates the full output and
// returns it so the route handler can post-check for the [ANSWER] tag.
async function streamTutor(problemText, rawSolution, wolframAnswer, systemPrompt, res, maxTokens = DEFAULT_MAX_TOKENS) {
  const t0 = Date.now();
  console.log(`[phase4-tutor] start (maxTokens: ${maxTokens})`);

  const wolframLine = wolframAnswer ? `\n\nVerified answer (must match): ${wolframAnswer}` : '';
  const userContent = `Original problem:\n${problemText}\n\nRaw solution to reformat:\n${rawSolution}${wolframLine}\n\nReformat the raw solution into the standard tutor format described in the system prompt. Translate to friendly Korean 존댓말 (~습니다/~합니다) and use the 핵심 아이디어 / ① ② ③ / ④ 검산 / [ANSWER]value[/ANSWER] / 여기까지 괜찮아? structure exactly as shown in the example. Do not change any mathematical content or the final answer — translate and reformat only.`;

  const stream = await openai.chat.completions.create(
    {
      model: 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0.4,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    },
    { timeout: 120000 }
  );

  let keepAliveTimer = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch (_) { clearInterval(keepAliveTimer) }
  }, 15000);

  let accumulated = '';
  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        accumulated += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }
  } finally {
    clearInterval(keepAliveTimer);
  }

  const ms = Date.now() - t0;
  console.log(`[phase4-tutor] done in ${ms}ms — output length: ${accumulated.length} chars, has [ANSWER]: ${accumulated.includes('[ANSWER]')}`);
  return accumulated;
}

// streamTutorCompletion — focused retry that streams ONLY the missing tail
// of an incomplete tutor response. Same SSE / keep-alive pattern as
// streamTutor; appended to the in-flight stream so the frontend renders it
// continuously after the truncated original.
async function streamTutorCompletion(rawSolution, res, maxTokens = DEFAULT_MAX_TOKENS) {
  const t0 = Date.now();
  console.log(`[phase4-tutor-completion] start (maxTokens: ${maxTokens})`);

  const userContent = `The previous formatting attempt did not include a final answer.\nThe raw solution is: ${rawSolution}\nYour only job in this retry is to complete the solution and end with [ANSWER]value[/ANSWER]. Do not rewrite the whole explanation. Just complete it and add the final answer.`;

  const stream = await openai.chat.completions.create(
    {
      model: 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0.2,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ]
    },
    { timeout: 120000 }
  );

  let keepAliveTimer = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch (_) { clearInterval(keepAliveTimer) }
  }, 15000);

  let accumulated = '';
  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        accumulated += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }
  } finally {
    clearInterval(keepAliveTimer);
  }

  const ms = Date.now() - t0;
  console.log(`[phase4-tutor-completion] done in ${ms}ms — output length: ${accumulated.length} chars, has [ANSWER]: ${accumulated.includes('[ANSWER]')}`);
  return accumulated;
}

// ── Main route ───────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  // ── Time budget bookkeeping ──────────────────────────────────────────────
  // requestStart is the very first thing recorded. `elapsed()` returns ms
  // since the request entered this handler — used for budget enforcement
  // and visible in every phase boundary log.
  const requestStart = Date.now();
  const elapsed = () => Date.now() - requestStart;

  // Route-level keep-alive — fires every 15s so background promises (e.g.
  // verifier launched fire-and-forget) and slow streams cannot have the SSE
  // connection reaped by Render/proxy idle timeouts.
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch (_) { clearInterval(keepAlive) }
  }, 15000);

  try {
    const { messages, grade, weakTopics, language } = req.body;
    const langInstruction = getLanguageInstruction(language);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
    // Give the response 120 seconds before the Node socket times out
    res.socket?.setTimeout(120000);
    res.flushHeaders();

    // ── Phase 0: instant SSE acknowledgement ──────────────────────────────
    console.log(`[phase0-instant] start elapsed=${elapsed()}ms`);
    res.write(`data: ${JSON.stringify({ chunk: '문제를 분석하고 있습니다...\n\n' })}\n\n`);
    console.log(`[phase0-instant] done elapsed=${elapsed()}ms`);

    const basePrompt = buildSystemPrompt(grade, weakTopics);
    const systemPrompt = langInstruction + '\n\n' + basePrompt;

    const solveMessages = messages.slice();
    const hasImage = solveMessages.some(m => m.imageBase64);
    const lastText = extractMathQuery(messages) || '';

    console.log(`[router] start image=${hasImage} lastText=${lastText.length} elapsed=${elapsed()}ms`);

    // ── Phase 1: OCR + normalization (per-image 2000ms timeout) ───────────
    if (hasImage) {
      for (let i = 0; i < solveMessages.length; i++) {
        if (!solveMessages[i].imageBase64) continue;
        try {
          const latex = await withTimeout(ocrExtract(solveMessages[i]), 2000);
          if (latex) {
            const normalized = normalizeLatex(latex);
            if (normalized !== latex) {
              console.log(`[phase1-normalize] adjusted: ${JSON.stringify(normalized.slice(0, 200))}`);
            }
            const { imageBase64, imageMimeType, ...rest } = solveMessages[i];
            solveMessages[i] = { ...rest, content: normalized };
          } else {
            console.warn(`[phase1-ocr] empty/timeout for message ${i} elapsed=${elapsed()}ms — keeping original image`);
          }
        } catch (ocrErr) {
          console.warn(`[phase1-ocr] failed for message ${i} elapsed=${elapsed()}ms:`, ocrErr.message || ocrErr);
        }
      }
      console.log(`[phase1-ocr] all images processed elapsed=${elapsed()}ms`);
    }

    const lastUser = [...solveMessages].reverse().find(m => m.role === 'user');
    const problemText = (typeof lastUser?.content === 'string' ? lastUser.content : '') || '';

    // Bug 3 — OCR failure on latest image: if the latest user message still
    // carries imageBase64 after the OCR loop AND has no usable text content,
    // OCR failed completely. Emit a clean Korean error instead of letting the
    // pipeline hand an empty problem to a downstream model that will respond
    // with a confused apology.
    const ocrFailedOnLatestImage =
      lastUser && lastUser.imageBase64 &&
      (!problemText.trim() || /^\(이미지\)?$/.test(problemText.trim()) || problemText.trim().length < 3);
    if (ocrFailedOnLatestImage) {
      console.warn(`[ocr-fallback] OCR failed for latest image — emitting Korean error elapsed=${elapsed()}ms`);
      res.write(`data: ${JSON.stringify({ chunk: '이미지를 인식하지 못했습니다. 텍스트로 문제를 입력해 주시거나 더 선명한 이미지로 다시 시도해 주세요.\n' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Casual / non-math input → skip classify + Wolfram + solver, stream directly.
    const looksLikeMath = hasImage || !!lastText;
    if (!looksLikeMath || !problemText.trim()) {
      console.log(`[router] non-math input — direct streaming elapsed=${elapsed()}ms`);
      await streamOpenAI(systemPrompt, solveMessages, res, 'gpt-4o', DEFAULT_MAX_TOKENS);
    } else {
      // ── Phase 2: launch background tasks (don't await) ────────────────
      // classify (1500ms), decompose (2000ms), wolfram (3000ms) all kicked
      // off concurrently. Warm-start is NOT launched here — it costs real
      // money and only fires for hard/olympiad after classification.
      console.log(`[phase2-launch] launching classify+decompose+wolfram elapsed=${elapsed()}ms`);
      const classifyPromise = withTimeout(classifyProblem(problemText), 1500);
      const decomposePromise = withTimeout(decomposeProblem(problemText), 2000);
      const wolframPromise = withTimeout(wolframLookup(problemText), 3000);

      // ── Phase 3a: collect fast metadata (max ~2s, the larger of the two
      //   inner timeouts) ────────────────────────────────────────────────
      const [rawClassification, rawDecomposition] = await Promise.all([
        classifyPromise,
        decomposePromise
      ]);
      const classification = rawClassification || {
        topic: 'unknown',
        difficulty: 'hard',
        needs_casework: false,
        is_multi_part: false
      };
      const decomposition = rawDecomposition || [];
      const { topic, difficulty } = classification;
      console.log(`[phase2-meta] ready elapsed=${elapsed()}ms — topic=${topic} difficulty=${difficulty} decomp=${decomposition.length} ${rawClassification ? '' : '(classify timed out)'}`);

      // ── Stage 2: select solver path ────────────────────────────────────
      // easy/medium → cheap   (gpt-4o, no warm-start)
      // hard        → moderate (warm-start o4-mini medium, 8s budget)
      // olympiad    → full-stack (warm-start o4-mini medium, 12s budget)
      let selectedPath;
      let thinkingBudget;
      if (difficulty === 'easy' || difficulty === 'medium') {
        selectedPath = 'cheap';
        thinkingBudget = difficulty === 'easy' ? 3000 : 5000;
      } else if (difficulty === 'hard') {
        selectedPath = 'moderate';
        thinkingBudget = 8000;
      } else {
        selectedPath = 'full-stack';
        thinkingBudget = 12000;
      }
      console.log(`[router] difficulty=${difficulty} topic=${topic} path=${selectedPath} budget=${thinkingBudget}ms elapsed=${elapsed()}ms`);

      // ── Phase 3b: stream real structural analysis (honest, derived from
      //   classification + decomposition) ──────────────────────────────────
      await streamStructuralAnalysis(res, classification, decomposition);
      console.log(`[phase3-structural] streamed elapsed=${elapsed()}ms`);

      // Per-difficulty token budget (shared by solver + tutor + warm-start).
      const maxTokens = tokensFor(difficulty);
      console.log(`[router] maxTokens=${maxTokens} (difficulty=${difficulty}) elapsed=${elapsed()}ms`);

      // ── Phase 4: solver — branch by path ──────────────────────────────
      let rawSolution = '';
      let wolframAnswer = null;
      // Track which model+effort produced the final rawSolution so the
      // incomplete-solver retry (FIX 5) can rerun the same configuration.
      let solverModelUsed = 'gpt-4o';
      let solverEffortUsed = 'medium';

      if (selectedPath === 'cheap') {
        // easy/medium: no warm-start. Wait for wolfram (already 3s-capped),
        // then run gpt-4o directly.
        wolframAnswer = await wolframPromise;
        console.log(`[phase4-solver] cheap path — gpt-4o elapsed=${elapsed()}ms wolfram=${wolframAnswer ? 'yes' : 'no'}`);
        try {
          rawSolution = await runSolver(problemText, wolframAnswer, 'gpt-4o', 'medium', null, maxTokens);
          solverModelUsed = 'gpt-4o';
          solverEffortUsed = 'medium';
        } catch (e) {
          console.error(`[phase4-solver] gpt-4o failed elapsed=${elapsed()}ms:`, e.message || e);
        }
      } else {
        // hard / olympiad: NOW launch warm-start, race it against the
        // remaining time-to-budget. Wolfram is fetched in parallel.
        const remainingForWarm = Math.max(1000, thinkingBudget - elapsed());
        console.log(`[phase4-warmstart] launching o4-mini medium remainingBudget=${remainingForWarm}ms elapsed=${elapsed()}ms`);
        const warmPromise = withTimeout(warmStartSolver(problemText, maxTokens), remainingForWarm);

        const [warmResult, wResult] = await Promise.all([warmPromise, wolframPromise]);
        wolframAnswer = wResult;

        if (warmResult) {
          console.log(`[phase4-warmstart] succeeded — using warm solution elapsed=${elapsed()}ms`);
          rawSolution = warmResult;
          solverModelUsed = 'o4-mini';
          solverEffortUsed = 'medium';
        } else {
          console.warn(`[timeout] warm-start missed deadline — using fast solver elapsed=${elapsed()}ms`);
          try {
            rawSolution = await runSolver(problemText, wolframAnswer, 'gpt-4o', 'medium', null, maxTokens);
            solverModelUsed = 'gpt-4o';
            solverEffortUsed = 'medium';
          } catch (e) {
            console.error(`[phase4-fastfallback] gpt-4o failed elapsed=${elapsed()}ms:`, e.message || e);
          }
        }
      }

      // ── FIX 5: incomplete-solver detection + one-shot retry ────────────
      if (rawSolution && hasIncompleteSignal(rawSolution)) {
        console.log(`[solver-retry] incomplete solution detected — completing. elapsed=${elapsed()}ms`);
        const continueNote = `Your previous solution was incomplete. It set up the cases but did not finish the analysis.\nContinue from where you left off and complete every case to reach the final answer.\nPrevious work: ${rawSolution}`;
        try {
          const completed = await runSolver(problemText, wolframAnswer, solverModelUsed, solverEffortUsed, continueNote, maxTokens);
          if (completed) rawSolution = completed;
        } catch (e) {
          console.warn(`[solver-retry] retry failed (keeping original):`, e.message || e);
        }
      }

      // ── Phase 5+6: verifier and self-consistency in BACKGROUND ────────
      // Fire-and-forget for hard/olympiad. They cannot block the user-facing
      // stream. If they detect issues, they only log — there's no retry path
      // because the response is already mid-stream by the time they finish.
      if ((difficulty === 'hard' || difficulty === 'olympiad') && rawSolution) {
        const solutionSnapshot = rawSolution;
        verifySolution(problemText, solutionSnapshot)
          .then(verification => {
            if (verification.ok) {
              console.log(`[phase5-verifier-bg] ok elapsed=${elapsed()}ms`);
            } else {
              console.warn(`[phase5-verifier-bg] FAILED (response already streamed) elapsed=${elapsed()}ms reason=${JSON.stringify((verification.reason || '').slice(0, 200))}`);
            }
          })
          .catch(err => console.warn('[phase5-verifier-bg] error:', err.message || err));
      }
      if (difficulty === 'olympiad' && rawSolution) {
        const solutionSnapshot = rawSolution;
        const wolframSnapshot = wolframAnswer;
        alternativeStrategySolver(problemText, wolframSnapshot, maxTokens)
          .then(async (altSolution) => {
            if (!altSolution) return;
            const same = await compareAnswers(solutionSnapshot, altSolution);
            if (same) {
              console.log(`[phase6-consistency-bg] alternative confirms primary elapsed=${elapsed()}ms`);
            } else {
              console.warn(`[phase6-consistency-bg] DISAGREE (response already streamed) elapsed=${elapsed()}ms`);
            }
          })
          .catch(err => console.warn('[phase6-consistency-bg] error:', err.message || err));
      }

      // ── Phase 7+8: tutor formatting and stream final answer ───────────
      if (rawSolution) {
        console.log(`[phase4-tutor] starting stream elapsed=${elapsed()}ms`);
        const tutorOutput = await streamTutor(problemText, rawSolution, wolframAnswer, systemPrompt, res, maxTokens);
        console.log(`[phase4-tutor] stream complete elapsed=${elapsed()}ms`);

        // ── FIX 4: incomplete-tutor detection + completion retry ─────────
        // If the tutor pass finished without emitting [ANSWER], stream a
        // focused completion that appends the missing tail to the same SSE
        // connection.
        if (!tutorOutput.includes('[ANSWER]')) {
          console.log(`[completion-retry] response was incomplete — retrying tutor pass elapsed=${elapsed()}ms`);
          try {
            await streamTutorCompletion(rawSolution, res, maxTokens);
          } catch (e) {
            console.warn(`[completion-retry] failed:`, e.message || e);
          }
        }
      } else {
        console.error(`[router] no rawSolution available — emitting apology elapsed=${elapsed()}ms`);
        res.write(`data: ${JSON.stringify({ chunk: '죄송합니다. 일시적인 오류로 풀이를 생성하지 못했습니다. 다시 시도해주세요.' })}\n\n`);
      }
    }

    console.log(`[router] response complete elapsed=${elapsed()}ms`);
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('AI chat error:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'AI 응답 생성 중 오류가 발생했습니다.' })}\n\n`);
      res.end();
    }
  } finally {
    clearInterval(keepAlive);
  }
});

// Streaming deep-dive explanation for a single step
// Generate a short practice test based on the last Q/A
router.post('/practice-test', async (req, res) => {
  try {
    const { userQuestion, assistantAnswer, grade, language, count = 3 } = req.body || {};
    const langInstruction = getLanguageInstruction(language);
    console.log('[PRACTICE] Route hit, body:', JSON.stringify(req.body).slice(0, 200));

    const originalProblem = String(userQuestion || '').slice(0, 500);
    console.log('Original problem passed to generator:', originalProblem);
    const prompt = `The student just solved this problem: "${originalProblem}"

Generate ${count} practice problems that are:
- EXACT same topic (if cubic polynomial → all ${count} must be cubic polynomials)
- EXACT same difficulty (same number of steps, same complexity)
- Different numbers/coefficients only — same structure
- All LaTeX math wrapped in $...$ (never raw text)
- Backslashes in JSON strings must be doubled: \\\\frac, \\\\cdot, \\\\sqrt
- ${langInstruction}

TOPIC DETECTION RULES (apply to the original problem above):
- If original has x³ or degree-3 → generate cubic (x³) problems only, never quadratic
- If original has sin/cos/tan → generate trig problems only
- If original has \\int or 적분 → generate integration problems only
- If original has lim or 극한 → generate limit problems only
- If original has log or ln → generate logarithm problems only
- If original has a_n or 수열 → generate sequence problems only
- If original has 확률 or P( → generate probability problems only
- Otherwise → match the exact operation type shown in the original

ANSWER POSITION RULES:
- The correct answer must NOT always be option A
- Distribute correct answers across A, B, C, D randomly across the ${count} problems

QUESTION FORMATTING RULES — mandatory:
- Never use \\begin{pmatrix}, \\begin{matrix}, \\begin{cases}, \\begin{bmatrix} in questions or options
- Write integrals as: $\\int_0^1 f(x)\\,dx$
- Write fractions as: $\\frac{a}{b}$
- Keep each question on one line — no line breaks inside question text
- Options must be simple expressions like $\\frac{\\pi}{8}\\ln 2$ — not full sentences
- Every math expression must be wrapped in $...$ or $$...$$ — never raw LaTeX outside delimiters

AI solution for context:
${String(assistantAnswer || '').slice(0, 2000)}

Grade: ${grade || '미상'}

Return ONLY this JSON (no other text):
{
  "topic": "detected topic name",
  "problems": [
    {
      "question": "problem text using $LaTeX$",
      "options": ["option 1", "option 2", "option 3", "option 4"],
      "answer": "A",
      "explanation": "why the correct answer is right, 1-2 sentences",
      "steps": [{"title": "Step 1: title", "content": "step content using $LaTeX$"}]
    }
  ]
}`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: langInstruction + '\nYou are a math tutor. Output ONLY valid JSON. No markdown.' },
        { role: 'user', content: prompt }
      ]
    });
    const raw = r.choices[0]?.message?.content || '';
    console.log('[PRACTICE] raw length:', raw.length);
    console.log('[PRACTICE] raw (full):', raw);

    const cleaned = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const jsonText = extractJson(cleaned) || cleaned;
    console.log('[PRACTICE] jsonText (first 600):', jsonText.slice(0, 600));
    const parsed = safeParseJson(jsonText);
    console.log('[PRACTICE] parsed type:', Array.isArray(parsed) ? `array[${parsed.length}]` : typeof parsed, '| keys:', parsed && typeof parsed === 'object' ? Object.keys(parsed) : 'n/a');

    const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

    // Support new { topic, problems[] } format and legacy { questions[] } / plain array
    const rawArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.problems)
        ? parsed.problems
        : Array.isArray(parsed?.questions)
          ? parsed.questions
          : null;

    if (!rawArray || rawArray.length < 1) {
      console.error('[practice-test] parse failed. finish_reason:', finishReason, '| parsed:', JSON.stringify(parsed)?.slice(0, 800));
      return res.json({ questions: [] });
    }

    const normalized = rawArray.slice(0, count).map((q) => {
      if (!q || typeof q !== 'object') return null;
      const question_latex = String(q.question || q.question_latex || '');
      const rawOptions = Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [];
      const options = rawOptions.slice(0, 4).map(o => String(o ?? ''));

      // Resolve correct_index from letter answer (new format) or numeric index (legacy)
      let correct_index = 0;
      if (typeof q.answer === 'string' && ANSWER_LETTERS.includes(q.answer.toUpperCase())) {
        correct_index = ANSWER_LETTERS.indexOf(q.answer.toUpperCase());
      } else if (typeof q.correctIndex === 'number') {
        correct_index = Math.min(3, Math.max(0, q.correctIndex));
      } else if (typeof q.correct_index === 'number') {
        correct_index = Math.min(3, Math.max(0, q.correct_index));
      }

      const answer_latex = String(q.answer_latex || options[correct_index] || '');
      const explanation = String(q.explanation || q.wrongAnswerExplanation || '');
      const steps = Array.isArray(q.steps)
        ? q.steps.map(s => ({ title: String(s.title || ''), content: String(s.content || '') })).filter(s => s.title)
        : [];
      const topic = String(q.topic || parsed?.topic || '');
      return { question_latex, options, correct_index, answer_latex, topic, steps, wrongAnswerExplanation: explanation };
    }).filter(q => q && q.question_latex);

    if (normalized.length === 0) {
      console.error('[practice-test] no valid questions after normalization');
      return res.json({ questions: [] });
    }

    for (const q of normalized) {
      while (q.options.length < 4) q.options.push('(보기 없음)');
      if (q.options.length > 4) q.options = q.options.slice(0, 4);
    }

    normalized.forEach(q => {
      const correctAnswer = q.options[q.correct_index];
      for (let i = q.options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
      }
      q.correct_index = q.options.indexOf(correctAnswer);
    });

    console.log('[PRACTICE] Parsed questions count:', normalized.length);
    res.json({ questions: normalized });
  } catch (err) {
    console.error('[PRACTICE] Error:', err.message);
    res.status(500).json({ error: err.message, questions: [] });
  }
});

// ── Parse streamed practice text into structured questions ───────────────────
function parsePracticeStream(text, count) {
  const results = []
  // Split on ===문제N=== ... ===끝N=== blocks
  const re = /===문제\d+===([\s\S]*?)(?====문제\d+===|===끝|$)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const block = m[1]
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    const getField = (prefix) => {
      const line = lines.find(l => l.startsWith(prefix))
      return line ? line.slice(prefix.length).trim() : ''
    }

    const question_latex = getField('문제:')
    if (!question_latex) continue

    const options = ['①:', '②:', '③:', '④:'].map(p => getField(p) || '(보기 없음)')
    const correctStr = getField('정답:').charAt(0)
    const correctMap = { '①': 0, '②': 1, '③': 2, '④': 3 }
    const correct_index = correctMap[correctStr] ?? 0
    const topic = getField('주제:')

    // Explanation: everything after 풀이: up to end of block
    const explIdx = block.indexOf('풀이:')
    const explanation = explIdx !== -1 ? block.slice(explIdx + 3).trim() : ''

    results.push({
      question_latex,
      options,
      correct_index,
      answer_latex: options[correct_index] || '',
      topic,
      steps: explanation ? [{ title: '풀이', content: explanation }] : [],
      wrongAnswerExplanation: ''
    })

    if (results.length >= count) break
  }
  return results
}

// Stream practice problems as SSE text tokens (same protocol as /message)
router.post('/practice-stream', authenticate, async (req, res) => {
  const { userQuestion, assistantAnswer, grade, language, count = 3 } = req.body || {}

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const langInstruction = getLanguageInstruction(language)

  const prompt = `방금 학생이 푼 문제와 정확히 같은 개념·유형의 연습 문제 ${count}개를 아래 형식으로만 작성해. 절대 다른 텍스트 없이 형식만 사용해.

형식 (이 형식을 정확히 반복):
===문제1===
문제: [문제 텍스트, 수식은 반드시 $...$]
①: [선택지1]
②: [선택지2]
③: [선택지3]
④: [선택지4]
정답: [①②③④ 중 하나]
주제: [개념명]
풀이: [단계별 풀이, 수식은 $...$]

===문제2===
문제: ...
...

===문제3===
문제: ...
...

규칙:
- 숫자만 바꾼 비슷한 난이도
- 같은 공식·풀이법 사용
- 모든 수식은 반드시 $...$ LaTeX 사용
- 정답 위치를 랜덤하게 섞어 (①②③④ 고르게 분포)
- ${langInstruction}

방금 푼 문제:
${String(userQuestion || '').slice(0, 2000)}

AI 풀이:
${String(assistantAnswer || '').slice(0, 4000)}

학년: ${grade || '미상'}`

  let accumulated = ''

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 3000,
      stream: true,
      messages: [
        { role: 'system', content: '너는 수학 튜터야. 주어진 형식으로만 연습 문제를 작성해. 형식 외의 텍스트는 절대 쓰지 마.' },
        { role: 'user', content: prompt }
      ]
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) {
        accumulated += text
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`)
      }
    }

    const questions = parsePracticeStream(accumulated, count)
    res.write(`data: ${JSON.stringify({ type: 'questions', questions })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[practice-stream] error:', err.message)
    res.write(`data: ${JSON.stringify({ error: '문제 생성 중 오류가 발생했습니다.' })}\n\n`)
    res.end()
  }
})

// Classify the topic of a math question (used for insight bar)
router.post('/classify-topic', async (req, res) => {
  try {
    const { userMessage } = req.body || {};
    if (!userMessage) return res.json({ topic: null });
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 20,
      messages: [
        { role: 'system', content: '이 수학 문제의 주제를 한국어로 5글자 이내로만 답해. 예: 확률, 극값, 수열, 미분, 적분, 함수, 기하' },
        { role: 'user', content: String(userMessage).slice(0, 500) }
      ]
    });
    const topic = r.choices[0]?.message?.content?.trim() || null;
    res.json({ topic });
  } catch {
    res.json({ topic: null });
  }
});

// Step-by-step explanation for a single practice question
router.post('/explain-question', async (req, res) => {
  try {
    const { question_latex, answer_latex } = req.body || {};
    if (!question_latex) return res.status(400).json({ error: '문제가 없습니다.' });

    const prompt = `너는 한국 수학 튜터야. 아래 문제의 단계별 풀이를 JSON으로만 출력해.

문제: ${String(question_latex).slice(0, 1000)}
정답: ${String(answer_latex || '').slice(0, 300)}

규칙:
- 반드시 한국어로만
- 반드시 JSON 배열만 출력. 다른 텍스트 절대 금지
- 형식: [{"title":"1단계: 제목","content":"내용. 모든 수식은 $수식$ 형식으로 감싸"},{"title":"2단계: 제목","content":"내용"}]

JSON:`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: '너는 한국 수학 튜터야. 반드시 JSON 배열만 출력해. 다른 텍스트 절대 금지.' },
        { role: 'user', content: prompt }
      ]
    });
    const raw = r.choices[0]?.message?.content || '';

    const jsonText = extractJson(raw) || raw.trim();
    const parsed = safeParseJson(jsonText);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error('[explain-question] parse failed. raw:', raw.slice(0, 500));
      return res.status(502).json({ error: '풀이 생성 결과를 해석할 수 없습니다.' });
    }

    const steps = parsed.map(s => ({
      title: String(s.title || ''),
      content: String(s.content || ''),
    })).filter(s => s.title && s.content);

    res.json({ steps });
  } catch (err) {
    console.error('explain-question error:', err.message || err);
    res.status(500).json({ error: '풀이 생성 중 오류가 발생했습니다.' });
  }
});

// ── Adaptive inline practice loop ─────────────────────────────────────────────
// Called right after a solution streams to completion.
// Returns q1 + 2 followup_easy + 2 followup_hard — all in one API call
// so every transition appears instantly with no second API call.
router.post('/inline-practice', async (req, res) => {
  try {
    const {
      concept = '수학',
      difficulty = 'medium',  // 'easy' | 'medium' | 'hard'
      userQuestion = '',
      grade = '고1',
    } = req.body || {};

    const aiSolutionSnippet = String(req.body.aiSolutionSnippet || '').slice(0, 400);
    const originalProblem = String(userQuestion).slice(0, 500);

    const prompt = `The student just solved this problem: "${originalProblem}"

Generate 5 practice problems that are:
- EXACT same topic (if cubic polynomial → all 5 must be cubic polynomials)
- EXACT same technique required (if they found extrema of cubic → all 5 find extrema of cubics)
- Same difficulty level
- Just change the coefficients/numbers

TOPIC DETECTION RULES:
- If original has x³ → generate cubic (x³) problems only, never quadratic
- If original has sin/cos → generate trig problems only
- If original has x⁴ → generate quartic problems only
- If original asks for 극값 → all 5 ask for 극값
- If original asks for 인수분해 → all 5 ask for 인수분해
- NEVER mix topics

Return ONLY this JSON, no other text:
{
  "problems": [
    {
      "question": "problem in Korean with LaTeX $...$",
      "options": ["value1", "value2", "value3", "value4"],
      "answer": "A",
      "explanation": "one line Korean explanation"
    }
  ]
}

EXAMPLE — if original was cubic extrema:
{
  "problems": [
    {
      "question": "함수 $f(x) = x^3 - 6x^2 + 9x + 1$의 극댓값을 구하세요.",
      "options": ["3", "4", "5", "6"],
      "answer": "C",
      "explanation": "$f'(x) = 3x^2 - 12x + 9 = 0$ → $x=1,3$, 극댓값 $f(1)=5$"
    }
  ]
}`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '수학 튜터. 반드시 지정된 JSON 형식만 출력.' },
        { role: 'user', content: prompt }
      ]
    });
    const raw = r.choices[0]?.message?.content || '';
    const parsed = safeParseJson(extractJson(raw) || raw);
    const problems = Array.isArray(parsed?.problems) ? parsed.problems : [];
    if (!problems.length) return res.json({ ok: false });

    // Convert new flat format { question, options[], answer, explanation }
    // into the InlinePractice format { question, choices[], correct, wrong_fb, right_fb }
    const OPTION_IDS = ['A', 'B', 'C', 'D'];
    const normNew = (q) => {
      if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2) return null;
      const choices = q.options.slice(0, 4).map((text, i) => ({
        id: OPTION_IDS[i],
        text: String(text),
      }));
      const correct = String(q.answer || 'A').toUpperCase();
      const expl    = String(q.explanation || '잘했어!');
      return {
        question: String(q.question),
        choices,
        correct,
        wrong_fb: `다시 생각해봐 — ${expl}`,
        right_fb: `정확해! ${expl}`,
      };
    };

    const normed = problems.map(normNew).filter(Boolean);
    if (!normed.length) return res.json({ ok: false });

    // Map flat 5-problem list to q1 / followup structure expected by InlinePractice
    const q1           = normed[0];
    const safeEasy     = normed.length >= 3 ? [normed[1], normed[2]] : [q1, q1];
    const safeHard     = normed.length >= 5 ? [normed[3], normed[4]] : safeEasy;

    res.json({ ok: true, concept, difficulty, q1, followup_easy: safeEasy, followup_hard: safeHard });
  } catch (err) {
    console.error('[inline-practice] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Bonus harder questions (Step 5 peak moment offer) ─────────────────────────
router.post('/inline-practice-bonus', async (req, res) => {
  try {
    const {
      concept = '수학',
      difficulty = 'hard',
      grade = '고1',
    } = req.body || {};

    const prompt = `너는 한국 ${grade} 수학 튜터야. 개념 "${concept}"에 대한 고난도 객관식 문제 2개를 만들어.

규칙:
- 난이도: 매우 어려운 (심화/응용)
- 각 문제: 3지선다 (A/B/C)
- 수식은 $...$ LaTeX. JSON 안 백슬래시 두 번: \\\\frac 등
- wrong_fb 형식: "[선택지]를 골랐지? [구체적 실수] — 핵심은 [인사이트]이야"
- right_fb: 1문장 격려
- 한국어

JSON만 출력:
{
  "bonus": [
    { "question": "...", "choices": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}], "correct": "B", "wrong_fb": "...", "right_fb": "..." },
    { "question": "...", "choices": [...], "correct": "A", "wrong_fb": "...", "right_fb": "..." }
  ]
}`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '수학 튜터. JSON만 출력.' },
        { role: 'user', content: prompt }
      ]
    });
    const raw = r.choices[0]?.message?.content || '';
    const parsed = safeParseJson(extractJson(raw) || raw);

    const norm = (q) => {
      if (!q || !q.question || !Array.isArray(q.choices)) return null;
      const choices = q.choices.map(c => ({ id: String(c.id || '?'), text: String(c.text || '') }));
      if (choices.length < 2) return null;
      return {
        question: String(q.question),
        choices,
        correct:  String(q.correct || choices[0].id),
        wrong_fb: String(q.wrong_fb || '다시 한 번 생각해봐.'),
        right_fb: String(q.right_fb || '잘했어!'),
      };
    };

    const bonus = Array.isArray(parsed?.bonus)
      ? parsed.bonus.map(norm).filter(Boolean)
      : [];

    if (bonus.length < 1) return res.json({ ok: false });
    res.json({ ok: true, bonus });
  } catch (err) {
    console.error('[inline-practice-bonus] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/generate-title', async (req, res) => {
  const { text, imageBase64, imageMimeType } = req.body;
  try {
    const hasImage = !!imageBase64;
    const model = hasImage ? 'gpt-4o' : 'gpt-4o-mini';

    const messages = hasImage ? [{
      role: 'user',
      content: [
        { type: 'text', text: '이 수학 문제를 10자 이내로 요약해줘. 예: \'수열 일반항 구하기\', \'확률 여사건 문제\'. 제목만 답해, 다른 말 없이.' },
        { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`, detail: 'low' } }
      ]
    }] : [{
      role: 'user',
      content: `다음 수학 문제를 15자 이내의 한국어 제목으로 요약해줘. 수학 개념/유형 중심으로. 제목만 답해, 다른 설명 없이.\n\n${text}`
    }];

    const r = await openai.chat.completions.create({ model, messages, max_tokens: 30, temperature: 0.3 });
    const title = (r.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '').slice(0, 20) || (hasImage ? '수학 문제' : (text || '').slice(0, 15));
    res.json({ title });
  } catch (e) {
    res.json({ title: (text && text !== '(이미지)') ? text.slice(0, 15) : '수학 문제' });
  }
});

module.exports = router;
