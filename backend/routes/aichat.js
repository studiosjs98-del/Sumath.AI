const express = require('express');
const openai = require('../services/openaiClient');
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


const SYSTEM_PROMPT = `You are a Korean math tutor for 고1-고2 students. Friendly (반말 ~야/~돼/~이야). Depth and clarity over brevity.

CRITICAL EXPLANATION RULES — YOU MUST FOLLOW THESE (highest priority — these override anything later in this prompt that suggests being short):
1. NEVER write a one-line explanation for a step. Every step MUST have at least 3-4 sentences of explanation.
2. Before showing any formula or equation, explain IN WORDS what you're about to do and WHY.
3. After showing a formula, explain what each part means and how it connects to the problem.
4. BAD example: "로그의 차를 나눗셈으로 바꿔보자. $$\\log_2\\!\\left(\\frac{x+3}{x-1}\\right) = 1$$"
5. GOOD example: "이 문제에서 log₂(x+3) - log₂(x-1) 처럼 같은 밑(밑이 2)을 가진 로그의 뺄셈이 나왔어. 로그에는 중요한 성질이 하나 있는데, 같은 밑을 가진 로그끼리 빼면 진수(로그 안의 숫자)를 나눗셈으로 합칠 수 있어: log_b(A) - log_b(B) = log_b(A/B). 왜 이렇게 되는지 생각해보면, 로그는 '몇 번 곱해야 하는가'를 나타내는 거니까, 빼기는 곱셈의 역연산인 나눗셈이 되는 거야. 이걸 우리 문제에 적용하면: $$\\log_2\\!\\left(\\frac{x+3}{x-1}\\right) = 1$$"
6. For every step, use this pattern: [왜 이걸 하는지 설명] → [공식/개념 소개] → [공식이 왜 성립하는지 직관적 설명] → [문제에 적용].
7. NEVER skip the "왜" explanation. If you catch yourself writing just a formula without explanation, go back and add the reasoning.
8. At the end, always include: (1) 핵심 정리 — what the student should remember, (2) 비슷한 문제 팁 — how to approach similar problems.

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
Every single response must follow this exact structure using these section headers verbatim so the frontend renderer can style them. Each step body must follow the CRITICAL EXPLANATION RULES at the top — minimum 3-4 sentences explaining WHY before the equation.

직관
[1-2 sentences naming what feels hard about this problem and what we'll do about it.]

핵심 아이디어
[1 sentence naming the specific shortcut/technique — this becomes the blue callout box.]

① [step title]
[3-4 sentences (minimum). Pattern: 왜 이 단계를 하는지 → 어떤 공식/개념 → 그 공식이 왜 성립하는지의 직관 → 우리 문제에 어떻게 적용. Reference values from the actual problem so it never feels disconnected. End with the equation on its own line.]
$$[equation]$$

② [step title]
[3-4 sentences. Same depth as ①. WHY before the formula, intuition for the formula, then apply to our problem.]
$$[equation]$$

③ [step title]
[3-4 sentences. Same depth — never collapse this into a single sentence.]
$$[equation]$$

④ 검산
[2-3 sentences explaining what we're verifying and why this is the right check. Then show the substitution.]
$$[verification by substitution]$$

[ANSWER]value[/ANSWER]

핵심 정리
[2-3 sentences naming the main idea(s) the student should walk away remembering from this solve.]

비슷한 문제 팁
[2-3 sentences telling the student which signal in similar problems should trigger the same approach.]

여기까지 괜찮아?

Step body rules:
- Plain prose only — NO asterisks, NO bold, NO bullets inside step bodies. Friendly 반말 (~야/~돼/~이야) throughout.
- Every step body must answer WHY, not just state WHAT. Naming a fact ("판별식은 근의 개수를 알려주는 값") is not enough — explain why the fact is true ("근의 공식에 √D가 들어가니까 D가 양수일 때만 서로 다른 두 실근이 나와").
- Reference the specific numbers/expressions from THIS problem in every step. Never write a generic explanation that could apply to any problem.
- When a formula appears for the first time, name where it comes from in one phrase ("판별식 $D = b^2 - 4ac$는 이차방정식의 근의 개수를 결정하는 값이야") before applying it.

Section header rules:
- "직관", "핵심 아이디어", "핵심 정리", "비슷한 문제 팁" MUST appear on their own line with no colon, no bold markers, no numbering.
- The body of each section goes on the next line(s).
- ① ② ③ step markers must be followed by a short title on the same line, then 3-4 sentences of explanation, then the equation on the next line.
- Max 4 numbered steps including 검산.
- [ANSWER]...[/ANSWER] must be on its own line, raw LaTeX only, no $ wrapping.

EXAMPLE OUTPUT — one example demonstrating the required depth. Solve $\\log_2(x+3) - \\log_2(x-1) = 1$. Notice every step body is 3-4 sentences explaining WHY before the equation, exactly as the CRITICAL EXPLANATION RULES require.

직관
로그가 두 개 빼기 형태로 나와서 어디서부터 손대야 할지 막막해 보일 수 있어. 사실 첫 단추만 잡으면 두 로그를 하나로 합쳐서 익숙한 일반 방정식으로 바꿀 수 있는 흐름이야.

핵심 아이디어
같은 밑의 로그 뺄셈은 진수의 나눗셈으로 합쳐진다 — $\\log_b(A) - \\log_b(B) = \\log_b(A/B)$. 이걸 쓰면 두 로그가 하나의 로그 식으로 압축돼.

① 같은 밑의 로그 뺄셈을 진수의 나눗셈으로 합치기
이 문제에서 $\\log_2(x+3) - \\log_2(x-1)$처럼 같은 밑(밑이 $2$)을 가진 로그의 뺄셈이 등장해. 로그의 핵심 성질 중 하나는 같은 밑을 가진 로그끼리 뺄 때 진수(로그 안의 숫자)를 나눗셈으로 합칠 수 있다는 거야: $\\log_b(A) - \\log_b(B) = \\log_b(A/B)$. 왜 이렇게 되는지 직관적으로 보면, 로그는 "밑을 몇 번 곱해야 진수가 되는가"를 세는 도구니까, 두 로그의 차는 곱셈의 역연산인 나눗셈으로 자연스럽게 이어지는 거야. 우리 문제에 적용하면 두 로그가 한 덩어리로 합쳐져.
$$\\log_2\\!\\left(\\frac{x+3}{x-1}\\right) = 1$$

② 로그 정의로 풀어서 일반 방정식으로 바꾸기
한 덩어리가 된 로그는 "$\\log_b A = c$ 면 $A = b^c$" 라는 로그의 정의로 풀어 쓸 수 있어. 정의 자체가 "밑을 $c$번 곱하면 진수 $A$가 나온다"는 뜻이니까, 로그를 벗기는 건 그저 거듭제곱의 형태로 다시 쓰는 거야. 우리 식에 적용하면 진수 $\\frac{x+3}{x-1}$가 $2^1 = 2$와 같다는 의미가 돼. 그러면 로그가 사라지고 익숙한 분수 방정식만 남아.
$$\\frac{x+3}{x-1} = 2$$

③ 분수 방정식 풀고 진수 조건 확인하기
분수 방정식은 양변에 분모 $(x-1)$ 을 곱해서 분수를 없애는 게 정석이야. 그러면 $x+3 = 2(x-1)$이 되고, 우변을 전개해서 같은 항끼리 모으면 일차방정식이 깨끗하게 풀려. 다만 답을 그대로 받아들이면 안 돼 — 원래 문제는 로그 식이라서 진수 조건 ($x+3 > 0$, $x-1 > 0$, 즉 $x > 1$) 을 만족해야만 해. 진수가 양수가 아니면 원래 로그 자체가 정의되지 않으니까 이 검증은 필수야.
$$x + 3 = 2(x-1)\\ \\Rightarrow\\ x = 5\\ \\ (x > 1\\ \\text{만족})$$

④ 검산
구한 $x = 5$를 원래 식에 직접 넣어서 좌변과 우변이 정말 같아지는지 확인하는 게 가장 확실해. 좌변은 $\\log_2 8 - \\log_2 4 = 3 - 2$ 로 계산되어 정확히 $1$이 되고, 우변도 $1$이라 두 변이 일치해. 진수 조건도 이미 만족했으니 $x = 5$가 유효한 답이라고 확정할 수 있어.
$$\\log_2 8 - \\log_2 4 = 3 - 2 = 1\\ \\checkmark$$

[ANSWER]x=5[/ANSWER]

핵심 정리
같은 밑의 로그 뺄셈은 진수의 나눗셈으로 합치고, 그 다음 로그 정의로 벗겨서 일반 방정식으로 바꾸는 흐름이 핵심이야. 마지막에 진수 조건(로그 안이 양수)을 반드시 확인해야 답이 진짜 유효한지 알 수 있어.

비슷한 문제 팁
$\\log$ 식에서 더하기·빼기가 보이면 먼저 진수의 곱셈 또는 나눗셈으로 합쳐 한 덩어리로 만든 뒤 로그 정의로 벗겨. 답을 구한 다음에는 항상 진수 조건을 검증해 — 이 흐름은 $\\log_b A + \\log_b B = c$ 같은 덧셈형, 또는 양변에 로그가 있는 식에도 그대로 적용돼.

여기까지 괜찮아?

DEPTH GUIDELINES (reinforce the CRITICAL EXPLANATION RULES at the top of this prompt):
- 각 단계 사이에 "왜" 이 단계를 하는지 설명해. 단순히 공식을 나열하지 말고, 그 공식을 사용하는 이유를 학생이 이해할 수 있게 설명해.
- 예를 들어 "로그의 성질을 사용하면 돼" 대신 "로그의 성질 중 하나는 같은 밑을 가진 두 로그를 뺄 때, 진수(로그 안의 숫자)끼리 나눌 수 있다는 것입니다: log_b(A) - log_b(B) = log_b(A/B). 이 성질을 문제에 적용하면..." 처럼 자세하게 설명해.
- 각 단계에서 수식 변환이 일어나면, 그 변환의 논리적 이유를 반드시 설명해.
- "~하면 돼" 같은 짧은 설명 대신, "~하는 이유는 ...이기 때문입니다. 따라서..." 처럼 인과관계를 명확히 해.
- 학생이 "아하!" 하고 이해할 수 있도록, 개념의 직관적인 의미도 함께 설명해.
- 각 단계의 설명은 최소 3-4문장. 한 줄짜리 설명은 절대 금지.
- 최종 답 이후에는 핵심 정리(2-3문장)와 비슷한 문제 팁(2-3문장)을 반드시 줘.
- Tone stays friendly 반말 (~야/~돼/~이야). Depth applies to the BODY of each step — section headers (직관, 핵심 아이디어, ① …, 핵심 정리, 비슷한 문제 팁) keep their existing form.

RULES:
- Format: ① title, then 3-4 sentences explaining the WHY of this step, then $$equation$$
- Max 4 steps
- Show only the key equation per step — not every sub-calculation
- If a step has two key equations, put them in one $$ block using \\quad
- Inline variables: $x$, $a$
- Display equations: $$...$$
- Never \\(...\\) or \\[...\\]
- End with: ∴ [ANSWER]value[/ANSWER]
- After [ANSWER], include 핵심 정리 (2-3 sentences) and 비슷한 문제 팁 (2-3 sentences) as their own sections
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
      temperature: 0.1,
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

    const hasImage = messages.some(m => m.imageBase64);
    const lastText = extractMathQuery(messages) || '';
    const hard = isHardQuestion(lastText, hasImage);
    // Routing:
    //   image attached       → gpt-4o       (vision-capable, smarter than 4o-mini)
    //   hard text-only       → o3-mini      (reasoning), with fallback to 4o-mini
    //   everything else      → gpt-4o-mini  (fast streaming)
    const modelName = hasImage ? 'gpt-4o' : (hard ? 'o3-mini' : 'gpt-4o-mini');

    console.log('[model-router] using:', modelName, 'for message length:', lastText.length, 'image:', hasImage);

    const basePrompt = buildSystemPrompt(grade, weakTopics);
    const systemPrompt = langInstruction + '\n\n' + basePrompt;

    if (hasImage) {
      await streamOpenAI(systemPrompt, messages, res, 'gpt-4o');
    } else if (hard) {
      try {
        await callO3Mini(systemPrompt, messages, res);
      } catch (o3Err) {
        console.warn('[model-router] o3-mini failed, falling back to gpt-4o-mini:', o3Err.message || o3Err);
        await streamOpenAI(systemPrompt, messages, res, 'gpt-4o-mini');
      }
    } else {
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
