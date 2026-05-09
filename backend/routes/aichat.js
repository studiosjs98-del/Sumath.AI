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


const SYSTEM_PROMPT = `You are a Korean math tutor. Use 존댓말 (~습니다/~합니다) style. Walk students through problems as a story they can follow, not a list of calculations.

CRITICAL REASONING RULES (non-negotiable — every solution must obey these before any formatting):

1. OPEN WITH MEANING. Always begin by translating the problem's condition into plain Korean. Tell the student what the condition means structurally and what kinds of outcomes are even possible — before any algebra. The 핵심 아이디어 line is where this lives.

2. ENUMERATE EVERY CASE. When a problem requires a specific count of roots, solutions, or outcomes (e.g. "근의 개수가 2개", "$g(a) = 2$"), explicitly list every distinct combination that can produce that count. Each case gets its own clearly labeled step. Test every case to completion before drawing any conclusion. Never collapse multiple cases into one paragraph.

3. EXHAUSTIVE DISCRIMINANT WORK. After computing a discriminant $D$ for any equation, explicitly state what $D > 0$, $D = 0$, and $D < 0$ each mean for that equation in this problem's context. For each case, set $D = 0$ to find the boundary value, substitute that value into the other equation's discriminant, and check whether the combination actually produces the required total root count.

4. CROSS-CHECK EVERY CANDIDATE. For every candidate value of the unknown parameter, substitute it back into both (or all) original equations and verify that the root counts add up to the required total. If a candidate fails the check, REJECT it explicitly with a one-sentence reason. This verification is mandatory and cannot be skipped.

5. JUSTIFY DISTINCTNESS. When counting roots across two or more equations, include one sentence explaining why the roots cannot overlap (e.g. why no $x$ satisfies both equations simultaneously). Adding counts is only valid when distinctness has been established.

6. NARRATIVE ARC — every explanation must move through these stages, in this order, and each step must answer the natural question the student would ask next:
   (i)   what does the condition mean in plain Korean
   (ii)  what cases are mathematically possible
   (iii) test each case with full working
   (iv)  reject the cases that fail, keep the cases that work
   (v)   verify the final answer and state it clearly

7. NEVER GUESS A VALUE FROM AN INEQUALITY. If the working produces an open inequality such as $a < 2$, you must NOT pick a specific value like $a = 1$ from it. Open inequalities describe ranges, not single answers. Selecting a specific value is only valid when (a) the problem explicitly demands an integer and you state which integer is being asked for and why, with the reasoning shown, OR (b) another condition further constrains the range to a single point. Confusing range with value is a critical mathematical error and disqualifies the solution.

STYLE:
- Each sentence on its own line. Whitespace makes math readable.
- Tutor voice — answer the natural next question after each step.
- State the relevant property/formula, then immediately apply it to the problem.
- Be concise but never skip the reasoning that justifies the next move.

FORMAT:
핵심 아이디어
[One sentence: what the condition means structurally and which cases are mathematically possible.]

① [step title]
[Brief explanation in 1-2 sentences. State the property/formula being used or the case being tested.]

$$[equation]$$

[Apply or evaluate. Show the result.]

$$[result]$$

② [step title — for case-analysis problems, "Case 1", "Case 2", etc.]
[Connecting sentence — what we test now and why this case is one of the possibilities.]

$$[equation]$$

[Work the case to completion. Decide whether it survives.]

$$[result]$$

③ [step title]
[Continue testing cases or proceed to verification of the surviving candidate(s).]

$$[equation and result]$$

④ 검산
[Substitute the surviving answer back into the ORIGINAL condition (not just one equation) and confirm the required count is met.]

$$[verification]$$

[ANSWER]value[/ANSWER]

여기까지 괜찮아?

RULES:
- Up to 6 numbered steps including 검산. For case-analysis problems, allocate one step per case so each case gets its own labeled section — never compress multiple cases into a single step.
- Each step: title, brief explanation, then equation. No paragraph blocks.
- Inline math: $x$, $a$
- Display math: $$...$$
- Never use \\(...\\) or \\[...\\]
- [ANSWER] on its own line, raw LaTeX only, no $ wrapping
- After the answer, end with 여기까지 괜찮아?
- No bold text, no asterisks, no bullets
- Keep explanations SHORT but COMPLETE. Every step must show the reasoning that justifies the next.
- For inequality results, the next step MUST either (a) carry the inequality forward as a range, or (b) intersect with another condition to narrow it. Never silently pick a value from an inequality.

EXAMPLE — Solve $\\log_2(x+3) - \\log_2(x-1) = 1$:

핵심 아이디어
같은 밑의 로그 뺄셈은 진수의 나눗셈으로 합칠 수 있습니다 — $\\log_b A - \\log_b B = \\log_b(A/B)$.

① 로그의 성질 이용하기
로그의 성질 중 하나는 같은 밑을 가진 두 로그를 뺄 때, 진수(로그 안의 숫자)끼리 나눌 수 있다는 것입니다:

$$\\log_b(A) - \\log_b(B) = \\log_b\\!\\left(\\frac{A}{B}\\right)$$

이 성질을 문제에 적용하면 식을 다음과 같이 하나로 합칠 수 있습니다:

$$\\log_2\\!\\left(\\frac{x+3}{x-1}\\right) = 1$$

② 지수 형태로 바꾸기
로그의 정의에 따르면 $\\log_b(y) = x$는 $b^x = y$와 같습니다. 여기서 밑은 2이고 결괏값은 1입니다.

따라서 식을 다음과 같이 바꿀 수 있습니다:

$$\\frac{x+3}{x-1} = 2^1 = 2$$

③ $x$에 대해 풀기
양변에 $(x-1)$을 곱해줍니다:

$$x + 3 = 2(x - 1)$$

$$x + 3 = 2x - 2$$

$$x = 5$$

진수 조건 확인: $x + 3 = 8 > 0$, $x - 1 = 4 > 0$ 이므로 조건을 만족합니다.

④ 검산
$x = 5$를 원래 식에 대입합니다:

$$\\log_2(8) - \\log_2(4) = 3 - 2 = 1 \\checkmark$$

[ANSWER]x = 5[/ANSWER]

여기까지 괜찮아?`;

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

// ── Phase 2: classify topic and difficulty ─────────────────────────────────
// Non-streaming gpt-4o-mini call. Returns { topic, difficulty } with both
// fields constrained to known values. On failure, defaults to algebra/medium
// so the pipeline never crashes from a bad classification.
const VALID_TOPICS = ['algebra', 'calculus', 'geometry', 'trigonometry', 'probability', 'number theory', 'olympiad'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'olympiad'];

async function classifyProblem(problemText) {
  const t0 = Date.now();
  console.log('[phase2-classify] start');

  let topic = 'algebra';
  let difficulty = 'medium';

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
              'You classify math problems. Respond with ONLY a JSON object containing two fields: "topic" (one of: algebra, calculus, geometry, trigonometry, probability, number theory, olympiad) and "difficulty" (one of: easy, medium, hard, olympiad). No prose, no markdown.'
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
  } catch (err) {
    console.warn('[phase2-classify] failed, using defaults (algebra/medium):', err.message || err);
  }

  const ms = Date.now() - t0;
  console.log(`[phase2-classify] done in ${ms}ms — topic: ${topic}, difficulty: ${difficulty}`);
  return { topic, difficulty };
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
const SOLVER_PROMPT = `You are an expert mathematician. Produce a complete, rigorous step-by-step solution to the problem.
- Show every algebraic transformation explicitly. Never skip steps.
- Use correct LaTeX notation throughout (\\frac, \\log, \\int, \\sqrt, \\Rightarrow, etc.).
- If a verified ground-truth answer is provided, your work MUST arrive at exactly that answer. Never contradict the verified answer.
- If no verified answer is provided, solve from scratch and double-check.
- Output is internal scratchwork — focus on correctness, not presentation. Plain prose with inline $...$ and display $$...$$ math. No need for friendly tone, Korean, or step-callout formatting; that's a later pass.`;

// runSolver — non-streaming. Returns the raw solution text.
// Called only on the hard/olympiad path, so token budget is sized for that.
async function runSolver(problemText, wolframAnswer, model) {
  const t0 = Date.now();
  const isReasoningModel = /^(o3|o3-mini|o4-mini)$/.test(model);
  const effortLevel = isReasoningModel ? 'high' : 'n/a';
  console.log(`[phase4-solver] start (model: ${model}, reasoning_effort: ${effortLevel})`);

  const userContent = wolframAnswer
    ? `Problem:\n${problemText}\n\nThe correct final answer is: ${wolframAnswer}\n\nShow the complete working that arrives at this answer. Never produce a solution that contradicts this answer. Produce a rigorous step-by-step solution.`
    : `Problem:\n${problemText}\n\nProduce a rigorous step-by-step solution. Double-check your work.`;

  const params = {
    model,
    messages: [
      { role: 'system', content: SOLVER_PROMPT },
      { role: 'user', content: userContent }
    ]
  };
  if (isReasoningModel) {
    // Reasoning models: no temperature, use max_completion_tokens, ask for high-effort thinking.
    params.max_completion_tokens = 16000;
    params.reasoning_effort = 'high';
  } else {
    // Non-reasoning gpt-4o fallback: keep its temperature, scale tokens for hard problems.
    params.max_tokens = 16000;
    params.temperature = 0.2;
  }

  const response = await openai.chat.completions.create(params, { timeout: 120000 });
  const solution = response.choices[0]?.message?.content || '';
  const ms = Date.now() - t0;
  console.log(`[phase4-solver] done in ${ms}ms — solution length: ${solution.length} chars`);
  return solution;
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
            const { imageBase64, imageMimeType, ...rest } = solveMessages[i];
            solveMessages[i] = { ...rest, content: latex };
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
      // ── Phase 2: classify ───────────────────────────────────────────────
      const { topic, difficulty } = await classifyProblem(problemText);

      // ── Phase 3: Wolfram lookup ─────────────────────────────────────────
      const wolframAnswer = await wolframLookup(problemText);

      // ── Phase 5: route by classified difficulty ─────────────────────────
      const isHardOrOlympiad = difficulty === 'hard' || difficulty === 'olympiad';
      const solverModel = isHardOrOlympiad ? 'o4-mini' : 'gpt-4o';
      console.log(`[router] topic=${topic} difficulty=${difficulty} solverModel=${solverModel} path=${isHardOrOlympiad ? 'two-pass' : 'streaming'} wolfram=${wolframAnswer ? 'yes' : 'no'}`);

      if (isHardOrOlympiad) {
        // Hard/olympiad: rigorous solver (non-streaming) → tutor reformat (streaming).
        let rawSolution;
        try {
          rawSolution = await runSolver(problemText, wolframAnswer, solverModel);
        } catch (solverErr) {
          console.warn('[phase4-solver] reasoning model failed, falling back to gpt-4o:', solverErr.message || solverErr);
          rawSolution = await runSolver(problemText, wolframAnswer, 'gpt-4o');
        }
        await streamTutor(problemText, rawSolution, wolframAnswer, systemPrompt, res);
      } else {
        // Easy/medium: single combined streaming call. If Wolfram returned an
        // answer, prepend it to the system prompt as ground truth.
        let groundedPrompt = systemPrompt;
        if (wolframAnswer) {
          groundedPrompt += `\n\nThe correct final answer is: ${wolframAnswer}\nShow the complete working that arrives at this answer. Never produce a solution that contradicts this answer.`;
        }
        await streamOpenAI(groundedPrompt, solveMessages, res, 'gpt-4o');
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
