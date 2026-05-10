const express = require('express');
const openai = require('../services/openaiClient');
const { wolframShortAnswer } = require('../services/wolframClient');
const { authenticate } = require('./middleware');
const { getLanguageInstruction } = require('../utils/language');

const router = express.Router();

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


const SYSTEM_PROMPT = `You are a Korean math tutor. You will receive a raw rigorous solution and rewrite it as a clear structured explanation in Korean 존댓말.

Follow this exact narrative structure every time:

1. Open by translating the problem condition into plain Korean. What does the condition actually require structurally? State this in one or two sentences before any calculation.

2. Step 1 — Analyze f(x) first. Factor it completely. State all roots clearly. Show the discriminant calculation to determine how many roots exist depending on the parameter.

3. Step 2 — Find critical points. Compute f'(x), find the critical points, and compute the exact local maximum M and local minimum m. Show every algebraic step.

4. Step 3 — Interpret the geometry. Explain that f(f(x))=0 means f(x) must equal each root of f(x)=0. Explain that the number of solutions to f(x)=c depends on where c sits relative to m and M. State explicitly:
   - c is between m and M → 3 solutions
   - c equals m or M → 2 solutions
   - c is outside [m,M] → 1 solution

5. Step 4 — Case analysis. Label each case clearly. For each case compute the total root count. Reject cases that do not give the required total. Keep cases that do.

6. Step 5 — Verify every candidate value of a by substituting back and confirming the root count matches exactly.

7. Conclusion — State all valid values of a and compute the final answer clearly.

Rules:
- Write in Korean 존댓말
- Use all existing formatting tags the frontend renders including step blocks, 핵심 아이디어, and 최종 답
- NEVER alter equations. NEVER simplify expressions. NEVER recompute values. The raw solution you receive has already been verified — your job is ONLY to explain, format, and translate tone. If you change a number, an equation, or a result, you have failed.
- Never skip a case even if it seems obvious
- Never state a conclusion without showing the verification
- The explanation should feel like a tutor telling a story where each step answers the natural question a student would ask next
- Match the depth and rigor of the MathGPT explanation provided as reference`;

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

function classifyDifficulty(message) {
  const killer = ['(가)와 (나)', '(나)와 (다)', '조건 (가)', '조건 (나)', '최고차항', '킬러', '실수 전체', '미분가능', '모든 실수', '정적분으로 정의', '점화식', '수열의 합', '이중근', '변곡점'];
  const hard = ['극값', '극대', '극소', '연속', '불연속', '극한', '치환적분', '부분적분', '로피탈', '증명', '역함수', '합성함수', '접선', '중근', '근과 계수', '여사건', '인수정리', '조립제법', '귀류법', '수학적 귀납법'];
  const medium = ['미분', '적분', '삼각함수', '로그', '지수', '확률', '통계', '수열', '벡터', '등차', '등비'];

  if (killer.some(w => message.includes(w))) return 'killer';
  if (hard.some(w => message.includes(w))) return 'hard';
  if (medium.some(w => message.includes(w))) return 'medium';
  return 'easy';
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
async function streamOpenAI(systemPrompt, messages, res, model = 'gpt-4o-mini') {
  const oaiMessages = buildOaiMessages(systemPrompt, messages);

  const stream = await openai.chat.completions.create(
    {
      model,
      max_tokens: 8000,
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

// Hard-question signals: returns true only if the question is text-only AND
// substantial enough to warrant o3-mini's reasoning (which doesn't support
// vision). Image questions are routed elsewhere — never to o3-mini.
function isHardQuestion(lastText, hasImage) {
  if (lastText.length < 50) return false;
  if (hasImage) return false;

  // Length-only trigger for clearly long questions.
  if (lastText.length > 200) return true;

  const keywords = [
    '적분', '미분', '로그', '증명', '극한', '수열', '급수', '행렬', '벡터', '확률',
    'proof', 'integral', 'derivative', 'limit', 'series', 'matrix', 'vector',
    'probability', 'log', 'ln'
  ];
  if (keywords.some(kw => lastText.includes(kw))) return true;

  // Advanced LaTeX notation
  if (/\\int|\\sum|\\lim|\\sqrt|\\frac\{[^}]*\{/.test(lastText)) return true;

  return false;
}

// Non-streaming path — o3-mini, collects full response then emits as one SSE chunk
async function callO3Mini(systemPrompt, messages, res) {
  const oaiMessages = buildOaiMessages(systemPrompt, messages);

  // Defensive: o3-mini does not support image_url parts. Even though the
  // router shouldn't send image-bearing requests here, strip any image_url
  // content from any message so a stale or unexpected payload can't crash
  // the request with "Invalid content type. image_url is only supported by
  // certain models."
  const safeMessages = oaiMessages.map(m => {
    if (Array.isArray(m.content)) {
      return { ...m, content: m.content.filter(c => c.type === 'text').map(c => c.text).join('\n') };
    }
    return m;
  });

  const response = await openai.chat.completions.create(
    {
      model: 'o3-mini',
      max_completion_tokens: 8000,
      messages: safeMessages,
    },
    { timeout: 120000 }
  );

  const text = response.choices[0]?.message?.content || '';
  if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
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

async function streamStructuralAnalysis(res, classification, decomposition) {
  const t0 = Date.now();
  console.log('[phase3-structural] start');

  const topicKo = TOPIC_KO[classification.topic] || classification.topic;
  const diffKo = DIFFICULTY_KO[classification.difficulty] || classification.difficulty;

  const lines = [];
  lines.push(`이 문제는 ${topicKo} 영역의 ${diffKo} 난도 문제입니다.`);
  if (classification.needs_casework) {
    lines.push('경우 분석(case analysis)이 필요합니다.');
  }
  if (classification.is_multi_part) {
    lines.push('여러 소문제로 나뉜 문제입니다.');
  }
  if (decomposition && decomposition.length > 0) {
    lines.push('');
    lines.push('다음 순서로 풀이를 진행하겠습니다:');
    decomposition.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
  }
  lines.push('');
  lines.push('잠시만 기다려주세요...');
  lines.push('');

  const text = lines.join('\n') + '\n';
  try {
    res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
  } catch (writeErr) {
    console.warn('[phase3-structural] write failed:', writeErr.message || writeErr);
  }

  const ms = Date.now() - t0;
  console.log(`[phase3-structural] done in ${ms}ms — streamed ${text.length} chars`);
}

// ── Phase 2: warm-start solver ─────────────────────────────────────────────
// o4-mini with reasoning_effort: "medium". Runs in parallel with classify /
// Wolfram / decompose so the heaviest call starts as early as possible. No
// Wolfram grounding here (Wolfram is concurrent); the verifier in Phase 5
// catches errors and the retry path adds Wolfram context if needed.
async function warmStartSolver(problemText) {
  const t0 = Date.now();
  console.log('[phase2-warmstart] start (o4-mini, reasoning_effort: medium)');

  let solution = null;
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'o4-mini',
        max_completion_tokens: 16000,
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
    console.warn('[phase2-warmstart] failed:', err.message || err);
  }

  const ms = Date.now() - t0;
  if (solution) {
    console.log(`[phase2-warmstart] done in ${ms}ms — solution length: ${solution.length} chars`);
  } else {
    console.log(`[phase2-warmstart] done in ${ms}ms — no solution (will fall back to runSolver in Phase 4)`);
  }
  return solution;
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
const SOLVER_PROMPT = `You are an elite competition mathematician solving Korean CSAT and olympiad problems.

Rules:
- Never guess or jump to conclusions
- Always factor and simplify first before analyzing
- For composite function problems like f(f(x))=0, always find ALL roots of f(x)=0 first, then analyze what f(x)=c means for each root c
- Always find critical points using f'(x) and compute the exact local maximum M and local minimum m values
- Always check every case systematically: what happens when the discriminant of each sub-problem is positive, zero, or negative
- Always verify that root counts across equations add up to exactly the required number
- Never output a final answer without substituting it back to verify
- Output raw rigorous mathematics only, no explanation formatting yet`;

// runSolver — non-streaming. Returns the raw solution text.
// `effort` controls reasoning_effort for o-series reasoning models.
// `retryContext` is an optional verifier/consistency note prepended to the
// user message when re-solving after a failure.
async function runSolver(problemText, wolframAnswer, model, effort = 'medium', retryContext = null) {
  const t0 = Date.now();
  const isReasoningModel = /^(o3|o3-mini|o4-mini)$/.test(model);
  const effortLevel = isReasoningModel ? effort : 'n/a';
  console.log(`[phase4-solver] start (model: ${model}, reasoning_effort: ${effortLevel}${retryContext ? ', retry: yes' : ''})`);

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
    params.max_completion_tokens = 16000;
    params.reasoning_effort = effort;
  } else {
    // Non-reasoning gpt-4o fallback.
    params.max_tokens = 16000;
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
async function alternativeStrategySolver(problemText, wolframAnswer) {
  const t0 = Date.now();
  console.log('[phase6-alt] start (o4-mini, reasoning_effort: medium, alternative strategy)');

  const wolframLine = wolframAnswer
    ? `\n\nThe correct final answer is: ${wolframAnswer}. Your solution must arrive at this answer.`
    : '';
  const userContent = `Problem:\n${problemText}${wolframLine}\n\nSolve this problem using an ALTERNATIVE METHOD different from the most obvious one. If the problem is naturally algebraic, try a geometric/graphical interpretation. If naturally calculus, try elementary inequalities. If naturally direct, try substitution or transformation. The goal is a fully independent path to the same final answer.`;

  let solution = null;
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'o4-mini',
        max_completion_tokens: 16000,
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
// step format and writes it as SSE chunks. Owns its own keep-alive timer to
// match streamOpenAI's pattern.
async function streamTutor(problemText, rawSolution, wolframAnswer, systemPrompt, res) {
  const t0 = Date.now();
  console.log('[phase4-tutor] start');

  const wolframLine = wolframAnswer ? `\n\nVerified answer (must match): ${wolframAnswer}` : '';
  const userContent = `Original problem:\n${problemText}\n\nRaw solution to reformat:\n${rawSolution}${wolframLine}\n\nReformat the raw solution into the standard tutor format described in the system prompt. Translate to friendly Korean 존댓말 (~습니다/~합니다) and use the 핵심 아이디어 / ① ② ③ / ④ 검산 / [ANSWER]value[/ANSWER] / 여기까지 괜찮아? structure exactly as shown in the example. Do not change any mathematical content or the final answer — translate and reformat only.`;

  const stream = await openai.chat.completions.create(
    {
      model: 'gpt-4o',
      max_tokens: 16000,
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

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }
  } finally {
    clearInterval(keepAliveTimer);
  }

  const ms = Date.now() - t0;
  console.log(`[phase4-tutor] done in ${ms}ms`);
}

// ── Main route ───────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  // Route-level keep-alive — fires every 15s for the whole request lifetime so
  // the non-streaming o3-mini path (which sits silent on OpenAI for 30-90s)
  // doesn't get its SSE connection reaped by Render/proxy idle timeouts.
  // streamOpenAI also runs its own keep-alive while it's active; the two are
  // additive and harmless.
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
    // Sent before any OCR / classification / Wolfram / solver work begins so
    // the user sees activity within ~50ms of the request arriving.
    const phase0t0 = Date.now();
    console.log('[phase0-instant] start');
    res.write(`data: ${JSON.stringify({ chunk: '문제를 분석하고 있습니다...\n\n' })}\n\n`);
    console.log(`[phase0-instant] done in ${Date.now() - phase0t0}ms — sent acknowledgement chunk`);

    const basePrompt = buildSystemPrompt(grade, weakTopics);
    const systemPrompt = langInstruction + '\n\n' + basePrompt;

    // Working copy. Phase 1 OCR will replace any image-bearing message's
    // content with extracted LaTeX in this copy; original `messages` untouched.
    const solveMessages = messages.slice();
    const hasImage = solveMessages.some(m => m.imageBase64);
    const lastText = extractMathQuery(messages) || '';

    console.log('[router] start — image:', hasImage, 'lastText length:', lastText.length);

    // ── Phase 1: OCR ──────────────────────────────────────────────────────
    if (hasImage) {
      for (let i = 0; i < solveMessages.length; i++) {
        if (!solveMessages[i].imageBase64) continue;
        try {
          const latex = await ocrExtract(solveMessages[i]);
          if (latex) {
            const normalized = normalizeLatex(latex);
            if (normalized !== latex) {
              console.log(`[phase1-normalize] adjusted: ${JSON.stringify(normalized.slice(0, 200))}`);
            }
            const { imageBase64, imageMimeType, ...rest } = solveMessages[i];
            solveMessages[i] = { ...rest, content: normalized };
          } else {
            console.warn(`[phase1-ocr] empty extraction for message ${i} — keeping original image`);
          }
        } catch (ocrErr) {
          console.warn(`[phase1-ocr] failed for message ${i} — keeping original image:`, ocrErr.message || ocrErr);
        }
      }
    }

    // Latest user message's content (post-OCR if it was an image).
    const lastUser = [...solveMessages].reverse().find(m => m.role === 'user');
    const problemText = (typeof lastUser?.content === 'string' ? lastUser.content : '') || '';

    // Casual / non-math input → skip classify + Wolfram and stream directly.
    // Preserves the fast-path for chitchat without paying for classification
    // and a 15s Wolfram timeout on inputs that aren't math problems.
    const looksLikeMath = hasImage || !!lastText;
    if (!looksLikeMath || !problemText.trim()) {
      console.log('[router] non-math input — direct streaming, skipping classify/Wolfram/solver');
      await streamOpenAI(systemPrompt, solveMessages, res, 'gpt-4o');
    } else {
      // ── Phase 2: parallel intelligence layer ───────────────────────────
      // classify + Wolfram + decompose + warmStartSolver run concurrently.
      // Each helper internally swallows its own errors (returns null/[]/null
      // on failure) so Promise.all never rejects.
      const phase2t0 = Date.now();
      console.log('[phase2-parallel] start — classify + wolfram + decompose + warmStart');
      const [classification, wolframAnswer, decomposition, warmSolution] = await Promise.all([
        classifyProblem(problemText),
        wolframLookup(problemText),
        decomposeProblem(problemText),
        warmStartSolver(problemText)
      ]);
      const { topic, difficulty, needs_casework, is_multi_part } = classification;
      console.log(`[phase2-parallel] done in ${Date.now() - phase2t0}ms — topic=${topic} difficulty=${difficulty} casework=${needs_casework} multi_part=${is_multi_part} wolfram=${wolframAnswer ? 'yes' : 'no'} decomp=${decomposition.length} warm=${warmSolution ? 'yes' : 'no'}`);

      // ── Phase 3: safe early streaming ───────────────────────────────────
      await streamStructuralAnalysis(res, classification, decomposition);

      // ── Phase 4: primary solver ─────────────────────────────────────────
      // Use the warm-start solution from Phase 2 if it completed; otherwise
      // run runSolver now (medium effort, with Wolfram grounding).
      let rawSolution = warmSolution;
      if (!rawSolution) {
        console.log('[phase4-solver] warm start unavailable — running solver now');
        try {
          rawSolution = await runSolver(problemText, wolframAnswer, 'o4-mini', 'medium');
        } catch (solverErr) {
          console.warn('[phase4-solver] o4-mini failed, falling back to gpt-4o:', solverErr.message || solverErr);
          try {
            rawSolution = await runSolver(problemText, wolframAnswer, 'gpt-4o', 'medium');
          } catch (fallbackErr) {
            console.error('[phase4-solver] gpt-4o fallback also failed:', fallbackErr.message || fallbackErr);
            rawSolution = '';
          }
        }
      } else {
        console.log('[phase4-solver] using warm-start solution from Phase 2');
      }

      // ── Phase 6: olympiad self-consistency (runs BEFORE verifier so a
      // disagreement can drive a high-effort retry that the verifier then
      // checks) ──────────────────────────────────────────────────────────
      if (difficulty === 'olympiad' && rawSolution) {
        const altSolution = await alternativeStrategySolver(problemText, wolframAnswer);
        const sameAnswer = await compareAnswers(rawSolution, altSolution);
        if (!sameAnswer && altSolution) {
          console.warn('[phase6-consistency] solutions disagree — escalating to high effort with both as context');
          const retryNote = `You produced two solutions that disagree on the final answer:\n\n--- Solution A (primary) ---\n${rawSolution}\n\n--- Solution B (alternative method) ---\n${altSolution}\n\nResolve the disagreement and produce the single correct solution.`;
          try {
            rawSolution = await runSolver(problemText, wolframAnswer, 'o4-mini', 'high', retryNote);
          } catch (e) {
            console.warn('[phase6-consistency] high-effort retry failed, keeping primary solution:', e.message || e);
          }
        }
      }

      // ── Phase 5: verifier (medium / hard / olympiad only) ───────────────
      if (difficulty !== 'easy' && rawSolution) {
        const verification = await verifySolution(problemText, rawSolution);
        if (!verification.ok) {
          console.warn('[phase5-verifier] verification failed — retrying solver with high effort');
          const retryNote = `Your previous solution failed verification because:\n${verification.reason}\n\nSolve the problem again carefully, fixing these specific errors.`;
          try {
            rawSolution = await runSolver(problemText, wolframAnswer, 'o4-mini', 'high', retryNote);
          } catch (retryErr) {
            console.warn('[phase5-verifier] high-effort retry failed, falling back to gpt-4o:', retryErr.message || retryErr);
            try {
              rawSolution = await runSolver(problemText, wolframAnswer, 'gpt-4o', 'medium', retryNote);
            } catch (gptErr) {
              console.error('[phase5-verifier] all retries failed, keeping unverified solution:', gptErr.message || gptErr);
            }
          }
        }
      }

      // ── Phase 7+8: tutor formatting and stream final answer ─────────────
      if (rawSolution) {
        await streamTutor(problemText, rawSolution, wolframAnswer, systemPrompt, res);
      } else {
        // No solution at all — emit a minimal apology so the user gets a
        // terminal message instead of an open SSE stream.
        console.error('[router] no rawSolution available — emitting apology');
        res.write(`data: ${JSON.stringify({ chunk: '죄송합니다. 일시적인 오류로 풀이를 생성하지 못했습니다. 다시 시도해주세요.' })}\n\n`);
      }
    }

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
