const express = require('express');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate } = require('./middleware');
const { getLanguageInstruction } = require('../utils/language');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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


const SYSTEM_PROMPT = `You are a Korean math tutor for 고1-고2 students. Short, simple, friendly.

METHOD SELECTION — mandatory:
Before solving, scan the problem for structure first. Check these shortcut patterns in order — if one applies, use it:

1. 접선 문제 (tangent to curve) → 접점 $x=p$는 중근이야. 두 식 같다고 놓은 방정식을 바로 $(x-p)^2(x-\\alpha)$ 꼴로 써. 전개한 결과와 $x^2$ 계수 비교 또는 근과 계수의 관계(근의 합 = $-b/a$)로 $\\alpha$ 한 줄에 구해. 다항식 나눗셈 금지, 단계적 인수분해 금지 — 바로 중근 구조 쓰고 근과 계수로 끝내.
2. 3차 이상 방정식 → 인수정리 먼저. 유리근 후보 대입해서 인수 찾고 조립제법. 근의 공식 쓰지 마.
3. 이차 방정식 → 인수분해 먼저 시도. 인수분해 안 되면 그때만 근의 공식.
4. 근의 조건 (두 실근, 중근, 허근) → 판별식 D로 바로. 근 직접 구하지 마.
5. 근과 계수의 관계 → 합·곱만 필요하면 근 구하지 말고 비에타 써.
6. 경우의 수 → 여사건이 더 빠른지 먼저 확인 (전체 - 반대).
7. 대칭성 (우함수·기함수·축 대칭) → 계산 범위 절반으로 줄이기.
8. 치환 → 복잡한 식을 t로 놓으면 차수 낮아지는 경우.
9. 극한 → 인수분해·유리화 먼저. 로피탈 안 써도 되는 경우가 대부분.
10. 부등식 → 산술-기하, 코시-슈바르츠 형태 체크.
11. 기하 문제 → 좌표 세우기 전에 기하적 성질 (닮음, 원주각, 피타고라스) 먼저.

일반 원칙:
- Look for cancellation in fractions BEFORE expanding
- Look for trig identities BEFORE algebraic manipulation
- If you catch yourself doing trial and error → stop and find the pattern instead
- 첫 번째 인사이트 문장은 "어떤 지름길을 쓰는지" 명시해 (예: "접점은 중근이니까 근과 계수 관계만 쓰면 돼").
- 지름길이 정말 없으면 교과서 방식으로 풀되, 억지로 영리한 척 하지 마 — 명료함이 우선.

FORMATTING CONSISTENCY — mandatory:
Every single response must follow this exact structure using these section headers verbatim so the frontend renderer can style them:

직관
[one or two sentences acknowledging what feels hard, reassuring it's short]

핵심 아이디어
[one sentence naming the specific shortcut/technique — this becomes the blue callout box]

① [step title]
[optional: one short conversational sentence (8-15 words) in friendly tutor voice ending in 야/돼 — ONLY include if the step involves real insight. Omit for mechanical steps.]
$$[equation]$$

② [step title]
[one short conversational sentence explaining the key insight, 8-15 words, ends in 야/돼]
$$[equation]$$

③ [step title]
[one short conversational sentence, 8-15 words]
$$[equation]$$

④ 검산
답 넣어서 양변 같은지 확인.
$$[verification by substitution]$$

Intuition line rules — these create the aha moment:
- NO asterisks or bold markers — plain text on its own line between the title and equation.
- Write like a tutor talking to a friend: "~이니까 ~야", "~라서 ~돼". NOT compressed notation.
- Length: 1 short sentence, 8-15 words. NOT a paragraph.
- The CONTENT must answer WHY this step works, not just WHAT we're doing. Bad: "판별식은 근이 몇 개인지 알려주는 값이야" (states a fact). Good: "근의 공식에 √D가 들어가니까 D가 양수면 두 실근이야" (explains why).
- For shortcuts/insights (중근, 근과 계수, 여사건), explain the geometric or structural reason in plain language.
- For formulas (판별식, 점화식, 미분 정의), name where the formula comes from in one phrase, not just what it is.
- Skip the intuition line for purely mechanical steps (e.g., "take derivative", "expand the bracket"). Include it only where the student would otherwise think "wait, why?"
- Typical response: intuition on 2 of 4 steps, not all 4. Quality over quantity.

Examples of WHY-answering intuition lines (1 sentence each):
- 접선 + 중근: "접선이 곡선을 스치는 점이라 그 x값이 두 번 들어간 형태로 인수분해돼"
- 판별식 D > 0: "근의 공식에 √D 있으니까 D가 양수일 때만 서로 다른 두 실근이 나와"
- 근과 계수의 관계: "다항식의 계수는 근들의 합·곱과 직접 연결돼 있어서 근을 직접 안 구해도 정보를 뽑을 수 있어"
- 여사건: "직접 세는 경우가 많을 때, 전체에서 반대를 빼는 게 훨씬 빨라"

Bridge rules — smooth step-to-step flow:
- When listing coefficients or specific values (a, b, c, or numbers from the problem), start with a half-sentence bridge that names WHERE those values come from. Example: "이차함수 ax² + bx + c 꼴이니까" before listing a, b, c.
- When a formula with named notation first appears (D, 판별식, f'(x), 점화식 등), add a half-sentence naming what it is. Example: "판별식 D = b² - 4ac는 근의 개수를 알려주는 값이야" before computing D.
- Bridges are SHORT — one phrase, not a full explanation. If the student already saw the concept earlier in the same solution, skip the bridge.
- The goal: reading top-to-bottom, the student should never think "where did that come from?"

[ANSWER]value[/ANSWER]

한 줄 정리
[one sentence the student should remember — becomes grey summary line]

여기까지 괜찮아?

Section header rules:
- "직관", "핵심 아이디어", "한 줄 정리" MUST appear on their own line with no colon, no bold markers, no numbering.
- The body of each section goes on the next line(s).
- ① ② ③ step markers must be followed by a short title on the same line, then the equation on the next line(s).
- Max 4 numbered steps including 검산.
- [ANSWER]...[/ANSWER] must be on its own line, raw LaTeX only, no $ wrapping.

EXAMPLE OUTPUT — two examples showing required structure. Example 1 shows shortcut-driven tangent problem. Example 2 shows bridge-driven discriminant problem where coefficient values and formula notation need brief connecting sentences.

EXAMPLE 1 — tangent problem (shortcut-driven):

직관
곡선이랑 접선이 다시 만나는 점 찾는 건데, 접점이 이미 하나라는 걸 쓰면 몇 줄이면 끝나.

핵심 아이디어
접점은 중근이니까 $(x-p)^2(x-\\alpha)$ 꼴로 바로 써 — 근과 계수로 $\\alpha$ 나와.

① 접선 식 구하기
$$f'(2)=9,\\quad y=9x-14$$

② 두 식 연립 후 중근 구조 쓰기
접선이 곡선을 스치는 지점이라 $x=2$가 중근이야. 그래서 $(x-2)^2(x-\\alpha)$ 꼴로 바로 쓸 수 있어.
$$x^3-12x+16=(x-2)^2(x-\\alpha)$$

③ $x^2$ 계수 비교로 $\\alpha$ 구하기
원식에 $x^2$ 항이 없으니까 세 근의 합이 0이야. 근이 $2, 2, \\alpha$라서 한 줄에 끝.
$$2+2+\\alpha=0\\ \\Rightarrow\\ \\alpha=-4$$

④ 검산
답 넣어서 양변 같은지 확인.
$$f(-4)=-50,\\quad 9(-4)-14=-50\\ \\checkmark$$

[ANSWER]-4[/ANSWER]

한 줄 정리
접선 문제는 '접점 = 중근'만 기억하면 근과 계수로 한 줄에 끝.

여기까지 괜찮아?

---

EXAMPLE 2 — discriminant problem (bridge-driven). Notice how each step connects smoothly with short bridge phrases:

직관
$k$가 식 안에 두 번 들어가서 복잡해 보여. 근데 두 실근 조건은 판별식 하나로 끝나.

핵심 아이디어
이차함수가 $x$축과 두 점에서 만나려면 판별식 $D>0$만 확인하면 돼.

① 계수 뽑기
이차함수 $ax^2+bx+c$ 꼴에서 계수만 뽑아내면 돼.
$$a=1,\\quad b=-2(k-1),\\quad c=k^2-3k+4$$

② 판별식 계산
판별식 $D=b^2-4ac$는 근이 몇 개인지 알려주는 값이야. 그냥 공식에 넣으면 돼.
$$D=(-2(k-1))^2-4(k^2-3k+4)=4(k-3)$$

③ 부등식 풀기
$D>0$이면 서로 다른 두 실근이 생기니까, 한 줄에 $k$ 범위 나와.
$$4(k-3)>0\\ \\Rightarrow\\ k>3$$

④ 검산
$k=4$ 넣어 $D>0$ 되는지 확인.
$$k=4\\ \\Rightarrow\\ D=4>0\\ \\checkmark$$

[ANSWER]k>3[/ANSWER]

한 줄 정리
이차함수가 $x$축과 두 점에서 만나려면 판별식 $D>0$만 확인하면 돼.

여기까지 괜찮아?

RULES:
- Exactly this format — ① then one sentence, then $$equation$$
- Max 4 steps
- Show only the key equation per step — not every sub-calculation
- One sentence per step, max 20 words
- No paragraphs, no numbered lists, no extra explanation
- If a step has two key equations, put them in one $$ block using \\quad
- Inline variables: $x$, $a$
- Display equations: $$...$$
- Never \\(...\\) or \\[...\\]
- End with: ∴ [ANSWER]value[/ANSWER]
- Last line always: 여기까지 괜찮아?
- [ANSWER] must contain raw LaTeX only, never wrapped in $
- Wrong: [ANSWER]$0, \\frac{\\pi}{2}$[/ANSWER]
- Right: [ANSWER]0,\\ \\frac{\\pi}{2},\\ \\pi[/ANSWER]`

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

async function streamOpenAI(systemPrompt, messages, res, model = 'gpt-4o-mini') {
  const oaiMessages = [
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

  const isO3 = model === 'o3' || model === 'o1' || model.startsWith('o3') || model.startsWith('o1')
  const maxTok = 8000

  console.log('[AI Request]', {
    model,
    max_tokens: maxTok,
    systemPromptLength: systemPrompt?.length,
    messagesCount: messages?.length,
  })

  const stream = await openai.chat.completions.create({
    model: model,
    ...(isO3 ? { max_completion_tokens: maxTok } : { max_tokens: maxTok }),
    ...(!isO3 ? { temperature: 0.1 } : {}),
    stream: true,
    messages: oaiMessages,
  });

  // Send a keep-alive comment every 8 seconds so proxies and the client's
  // inactivity timer do not close the connection during slow reasoning.
  let keepAliveTimer = setInterval(() => {
    try { res.write(': keep-alive\n\n') } catch (_) { clearInterval(keepAliveTimer) }
  }, 8000);

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }
  } finally {
    clearInterval(keepAliveTimer);
  }
}

// ── Main route ───────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
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

    const hasImage = messages.some(m => m.imageBase64);
    const lastText = extractMathQuery(messages) || '';
    const textTier = classifyDifficulty(lastText);
    const tier = hasImage ? 'killer' : textTier;
    const isHardQuestion = (tier === 'killer' || tier === 'hard');

    const basePrompt = buildSystemPrompt(grade, weakTopics);

    const systemPrompt = langInstruction + '\n\n' + basePrompt;

    if (tier === 'killer' || tier === 'hard') {
      console.log(`[HARD+] o3 | "${lastText.slice(0, 60)}"`);
      await streamOpenAI(systemPrompt, messages, res, 'o3');
    } else {
      console.log(`[EASY/MED] gpt-4o-mini | "${lastText.slice(0, 60)}"`);
      await streamOpenAI(systemPrompt, messages, res, 'gpt-4o-mini');
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

    const practiceModel = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: langInstruction + '\n\nYou are a math tutor. Output ONLY valid JSON matching the exact schema requested. No markdown, no extra text.',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 6000 },
    });
    const geminiResult = await practiceModel.generateContent(prompt);
    const raw = geminiResult.response.text();
    console.log('[PRACTICE] gemini raw length:', raw.length);
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

    const inlineModel = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: '수학 튜터. 반드시 지정된 JSON 형식만 출력.',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 3000 },
    });
    const inlineResult = await inlineModel.generateContent(prompt);
    const raw = inlineResult.response.text();
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

    const bonusModel = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: '수학 튜터. JSON만 출력.',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 1500 },
    });
    const bonusResult = await bonusModel.generateContent(prompt);
    const raw = bonusResult.response.text();
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
