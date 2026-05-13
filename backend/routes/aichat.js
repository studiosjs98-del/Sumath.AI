const express = require('express');
const openai = require('../services/openaiClient');
const { authenticate } = require('./middleware');
const { getLanguageInstruction } = require('../utils/language');

const router = express.Router();

// ── tiny utilities ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise, ms, fallback = null) =>
  Promise.race([promise, sleep(ms).then(() => fallback)]);

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

// ── tutor system prompt — solver outputs this format directly ───────────────
const SYSTEM_PROMPT = `당신은 한국 수학 전문 AI 튜터입니다. 모든 설명은 반드시 한국어로만 작성하세요.
영어는 절대 사용하지 마세요.

응답은 반드시 아래 마크업 태그 구조를 따르세요:

[핵심아이디어]
이 문제의 핵심 개념을 1~2문장으로 간결하게 설명하세요.
무엇을 구하는 문제인지, 어떤 전략으로 접근할지만 씁니다.
[/핵심아이디어]

[풀이]
STEP 1 | (단계 이름)
이 단계에서 무엇을 하는지 한 문장으로 설명합니다.
(수식)
→ 이 결과가 의미하는 것: (한 문장 해석)

STEP 2 | (단계 이름)
...

각 STEP은 반드시:
- 단계 이름이 있어야 합니다 (예: "판별식 계산", "경우 나누기")
- 수식 뒤에 → 로 시작하는 해석 문장이 있어야 합니다
- 다음 단계로 넘어가는 연결 문장으로 끝나야 합니다 (예: "이제 각 경우를 분석합니다.")

경우를 나눌 때는 반드시:
[경우 1] 제목
내용
결론: (한 문장)

[경우 2] 제목
내용
결론: (한 문장)

[결합] 두 조건을 합치면: (결론)
[/풀이]

[정리]
최종 답: (답)
핵심 포인트: (이 문제에서 배운 것 한 문장)
[/정리]

규칙:
- 영어 단어 절대 사용 금지 (Set up, Solve, Determine 등 모두 금지)
- 각 STEP 사이에 빈 줄 하나
- 수식은 반드시 $...$ 또는 $$...$$ LaTeX 형식
- 표준 KaTeX 명령어만 사용 (\\sin, \\cos, \\frac, \\leq, \\geq, \\Rightarrow 등)
- \\s, \\E 같은 약식 명령어 절대 사용 금지`;

function buildSystemPrompt(grade, weakTopics) {
  const gradeStr = grade || '고등학교';
  const weakStr = weakTopics && weakTopics.length > 0
    ? weakTopics.map(t => t.topic || t).join(', ')
    : '없음';
  return `${SYSTEM_PROMPT}

학생 정보:
- 학년: ${gradeStr}
- 취약 단원: ${weakStr}`;
}

// ── difficulty router — pure heuristic, no LLM call ────────────────────────
// Routes most problems to gpt-4o; escalates to gpt-5.5 for signals of CSAT /
// olympiad-level difficulty. Scoring rather than hard cutoffs so the
// threshold is one number to tune from real traffic.
const HARD_KEYWORDS = [
  /수능|모의고사|평가원|6\s*평|9\s*평|6월\s*모평|9월\s*모평/,
  /올림피아드|KMO|IMO|APMO/,
  /증명하시오|증명하라|보여라/,
  /모든\s+\S+\s*(을|를)?\s*구하시오/,
];

const HARD_LATEX = [
  /\\oint|\\iint|\\iiint/,
  /\\lim_\{[^}]*\\to/,
  /\\sum_\{[^}]*=[^}]*\}\^\{?\s*\\infty/,
  /\\binom|\\choose/,
];

function routeDifficulty(text) {
  if (!text) return 'gpt-4o';
  let score = 0;
  if (text.length > 400) score += 1;
  if (text.length > 800) score += 1;
  if ((text.match(/\([a-z가-힣0-9]\)/g) || []).length >= 3) score += 1;
  if (HARD_KEYWORDS.some(rx => rx.test(text))) score += 2;
  if (HARD_LATEX.some(rx => rx.test(text))) score += 1;
  if (/\\(?:int|sum|prod)/.test(text) && /\\frac/.test(text)) score += 1;
  return score >= 2 ? 'gpt-5.5-2026-04-23' : 'gpt-4o';
}

// ── OCR: image → LaTeX (single gpt-4o vision call) ─────────────────────────
async function ocrExtract(message) {
  const t0 = Date.now();
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
  console.log(`[ocr] done in ${Date.now() - t0}ms — len=${latex.length}`);
  return latex;
}

// Conservative LaTeX cleanup: code fences, \(\) → $$, bare |...| → \left|\right|.
function normalizeLatex(latex) {
  if (!latex || typeof latex !== 'string') return '';
  let s = latex.trim();
  s = s.replace(/^```(?:latex|math|tex)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
  s = s.replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, '$$$1$$');
  s = s.replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, '$$$$$1$$$$');
  s = s.replace(/(?<!\\left)\|([^|\n]*[A-Za-z0-9][^|\n]*?)\|(?!\\right)/g, '\\left|$1\\right|');
  return s.trim();
}

// ── /message: OCR (if image) → route → single streaming solver call ────────
router.post('/message', async (req, res) => {
  const requestStart = Date.now();
  const elapsed = () => Date.now() - requestStart;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setTimeout(120000);
  res.flushHeaders();

  const sendChunk = (chunk) => {
    try { res.write(`data: ${JSON.stringify({ chunk })}\n\n`) } catch (_) {}
  };
  const finish = () => {
    try { res.write('data: [DONE]\n\n'); res.end(); } catch (_) {}
  };

  // SSE keep-alive — proxies / browsers reap idle connections otherwise.
  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch (_) { clearInterval(keepAlive); }
  }, 15000);
  req.on('close', () => clearInterval(keepAlive));

  try {
    const { messages, grade, weakTopics } = req.body || {};
    const arr = Array.isArray(messages) ? messages : [];
    const lastUser = [...arr].reverse().find(m => m.role === 'user');

    if (!lastUser) {
      sendChunk('문제를 보내주세요.');
      return finish();
    }

    // 1. Resolve the problem text (OCR only if the latest message has an image)
    let problemText = typeof lastUser.content === 'string' ? lastUser.content.trim() : '';
    if (lastUser.imageBase64) {
      console.log(`[/message] ocr start elapsed=${elapsed()}ms`);
      try {
        const latex = await withTimeout(ocrExtract(lastUser), 8000);
        if (latex) problemText = normalizeLatex(latex);
      } catch (e) {
        console.warn('[/message] ocr error:', e.message || e);
      }
      console.log(`[/message] ocr done elapsed=${elapsed()}ms len=${problemText.length}`);
    }

    if (!problemText || problemText === '(이미지)' || problemText.length < 3) {
      sendChunk('이미지를 인식하지 못했습니다. 텍스트로 문제를 입력해 주시거나 더 선명한 이미지로 다시 시도해 주세요.');
      return finish();
    }

    // 2. Heuristic route — no LLM, ~microseconds
    const model = routeDifficulty(problemText);
    const maxTokens = model === 'gpt-4o' ? 4000 : 16000;
    console.log(`[/message] routed model=${model} maxTokens=${maxTokens} elapsed=${elapsed()}ms`);

    // 3. Single streaming solver call. The model outputs the tagged format
    //    directly; no separate tutor / reformatter / verifier stage.
    const stream = await openai.chat.completions.create(
      {
        model,
        stream: true,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: buildSystemPrompt(grade, weakTopics) },
          { role: 'user', content: `다음 문제의 풀이를 위 형식으로 작성하세요:\n\n${problemText}` },
        ],
      },
      { timeout: 120000 }
    );

    let ttft = null;
    for await (const part of stream) {
      const t = part.choices[0]?.delta?.content;
      if (t) {
        if (ttft === null) {
          ttft = elapsed();
          console.log(`[/message] first token elapsed=${ttft}ms`);
        }
        sendChunk(t);
      }
    }

    console.log(`[/message] done elapsed=${elapsed()}ms ttft=${ttft}ms`);
    finish();
  } catch (err) {
    console.error('[/message] error:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
    } else {
      try { res.write(`data: ${JSON.stringify({ error: 'AI 응답 생성 중 오류가 발생했습니다.' })}\n\n`) } catch (_) {}
      finish();
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
      console.error('[practice-test] parse failed. parsed:', JSON.stringify(parsed)?.slice(0, 800));
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
