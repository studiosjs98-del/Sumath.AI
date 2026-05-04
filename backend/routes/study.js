const express = require('express')
const Groq = require('groq-sdk')
const db = require('../database/db')
const { authenticate } = require('./middleware')

const router = express.Router()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function extractJson(text) {
  if (!text || typeof text !== 'string') return null
  const startArr = text.indexOf('[')
  const endArr = text.lastIndexOf(']')
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) return text.slice(startArr, endArr + 1)
  const startObj = text.indexOf('{')
  const endObj = text.lastIndexOf('}')
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) return text.slice(startObj, endObj + 1)
  return null
}

function safeParseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// POST /:problemId/explain — auto-generate step-by-step explanation after student answers
router.post('/:problemId/explain', authenticate, async (req, res) => {
  const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.problemId)
  if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

  const { isCorrect, selectedOptionText } = req.body

  const prompt = `당신은 친절한 한국 수학 선생님입니다.

문제: ${problem.question_latex}
정답: ${problem.answer_latex}
풀이 단계: ${problem.solution_steps}
학생이 선택한 답: ${selectedOptionText || '없음'}
맞았나요? ${isCorrect ? '예 (정답)' : '아니오 (오답)'}

${isCorrect
  ? '학생이 정답을 맞혔습니다. 왜 이 답이 맞는지 단계별로 친절하게 설명해주세요. 수식은 $LaTeX$ 형식으로 작성하세요.'
  : '학생이 틀렸습니다. 올바른 풀이 방법을 단계별로 친절하게 설명하고, 흔한 실수 포인트도 알려주세요. 수식은 $LaTeX$ 형식으로 작성하세요.'}

응답 형식:
1단계: ...
2단계: ...
3단계: ...
핵심 포인트: ...

최대 5단계, 간결하게 작성해주세요.`

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
    res.json({ explanation: response.choices[0].message.content })
  } catch (err) {
    console.error('Explain error:', err.message || err)
    res.status(500).json({ error: 'AI 설명을 생성할 수 없습니다.' })
  }
})

// POST /:problemId/practice — generate 5 similar practice questions (based on the original problem)
router.post('/:problemId/practice', authenticate, async (req, res) => {
  const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.problemId)
  if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

  const { explanation } = req.body || {}

  const prompt = `당신은 한국 수학 선생님입니다. 아래 문제와 "매우 유사한" 연습문제 5개를 만들어주세요.

제약:
- 난이도와 유형은 원문과 거의 같게
- 숫자/계수/조건만 살짝 바꿔서 비슷하게
- 각 문항은 한 번에 풀 수 있는 단답형/계산형/간단한 서술형으로
- 모든 수식은 LaTeX 문자열로
- 반드시 JSON만 출력 (설명/코드블록/문장 금지)

원문 정보:
- 학년: ${problem.grade}
- 단원: ${problem.topic}
- 문제(LaTeX): ${problem.question_latex}
- 정답(LaTeX): ${problem.answer_latex}

AI 풀이 설명(참고, 있을 수도 없음):
${explanation || '(없음)'}

출력 JSON 형식 (배열, 정확히 5개):
[
  {
    "question_latex": "...",
    "answer_latex": "...",
    "similarity_reason": "원문과 유사한 이유를 한 문장(한국어)"
  }
]`

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = response.choices?.[0]?.message?.content || ''
    const jsonText = extractJson(raw) || raw.trim()
    const parsed = safeParseJson(jsonText)

    if (!Array.isArray(parsed) || parsed.length !== 5) {
      return res.status(502).json({ error: '연습문제 생성 결과를 해석할 수 없습니다.', raw: raw.slice(0, 4000) })
    }

    const normalized = parsed.map(q => ({
      question_latex: String(q.question_latex || ''),
      answer_latex: String(q.answer_latex || ''),
      similarity_reason: String(q.similarity_reason || '')
    })).filter(q => q.question_latex && q.answer_latex)

    if (normalized.length !== 5) {
      return res.status(502).json({ error: '연습문제 형식이 올바르지 않습니다.', raw: raw.slice(0, 4000) })
    }

    res.json({ questions: normalized })
  } catch (err) {
    console.error('Practice error:', err.message || err)
    res.status(500).json({ error: '연습문제를 생성할 수 없습니다.' })
  }
})

// POST /:problemId/chat-practice — generate 3-5 practice questions from last Q/A in chat assistant
router.post('/:problemId/chat-practice', authenticate, async (req, res) => {
  const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.problemId)
  if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

  const { userQuestion, assistantAnswer, count } = req.body || {}
  const n = Math.max(3, Math.min(5, Number(count) || 5))

  const prompt = `당신은 한국 수학 선생님입니다. 아래 "학생 질문"과 "AI 답변"을 바탕으로, 같은 주제/난이도의 짧은 미니 테스트를 만들어주세요.

제약:
- 문제 수: ${n}개
- 원래 질문과 같은 단원/난이도/스타일로 유사하게
- 각 문항은 (A) 4지선다 또는 (B) 단답형 중 하나
- 모든 수식은 LaTeX 문자열로
- 반드시 JSON만 출력 (설명/코드블록/문장 금지)

컨텍스트(참고):
- 학년: ${problem.grade}
- 단원: ${problem.topic}
- 난이도(참고): ${problem.difficulty}
- 원문 문제(참고): ${problem.question_latex}

학생 질문:
${String(userQuestion || '').slice(0, 2000)}

AI 답변:
${String(assistantAnswer || '').slice(0, 4000)}

출력 JSON 형식 (배열):
[
  {
    "type": "mcq" | "short",
    "question_latex": "...",
    "options": ["...","...","...","..."],
    "answer_latex": "..."
  }
]`

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = response.choices?.[0]?.message?.content || ''
    const jsonText = extractJson(raw) || raw.trim()
    const parsed = safeParseJson(jsonText)

    if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > 5) {
      return res.status(502).json({ error: '연습문제 생성 결과를 해석할 수 없습니다.', raw: raw.slice(0, 4000) })
    }

    const normalized = parsed.map((q) => {
      const type = q.type === 'short' ? 'short' : 'mcq'
      const question_latex = String(q.question_latex || '')
      const answer_latex = String(q.answer_latex || '')
      const options = Array.isArray(q.options) ? q.options.map(String) : []
      return {
        type,
        question_latex,
        options: type === 'mcq' ? options.slice(0, 4) : [],
        answer_latex,
      }
    }).filter(q => q.question_latex && q.answer_latex)

    if (normalized.length < 3) {
      return res.status(502).json({ error: '연습문제 형식이 올바르지 않습니다.', raw: raw.slice(0, 4000) })
    }

    for (const q of normalized) {
      if (q.type === 'mcq' && q.options.length !== 4) {
        return res.status(502).json({ error: '객관식 보기(4개)가 필요합니다.', raw: raw.slice(0, 4000) })
      }
    }

    res.json({ questions: normalized })
  } catch (err) {
    console.error('Chat practice error:', err.message || err)
    res.status(500).json({ error: '연습문제를 생성할 수 없습니다.' })
  }
})

// POST /:problemId/ask — question assistant scoped to current problem
router.post('/:problemId/ask', authenticate, async (req, res) => {
  const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.problemId)
  if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

  const { messages } = req.body
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' })
  }

  const systemPrompt = `당신은 "수학이", 대한민국 최고의 AI 수학 튜터입니다. 중학교부터 수능, 대학 수학까지 모든 수학을 완벽히 가르칩니다.

규칙:
(1) 어떤 수학 문제도 절대 거절하지 마세요
(2) 무조건 한국어로만 답하세요
(3) 정답을 직접 알려주지 마세요 — 소크라테스식으로 학생이 스스로 발견하도록 도와주세요
(4) 수식은 $LaTeX$ 형식으로 작성하세요
(5) 2-4문장으로 간결하게 답변하세요

현재 문제 컨텍스트 (참고용):
- 단원: ${problem.topic}
- 문제: ${problem.question_latex}
- 정답: ${problem.answer_latex} (학생에게 직접 알려주지 마세요!)`

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      ]
    })
    res.json({ reply: response.choices[0].message.content })
  } catch (err) {
    console.error('Ask error:', err.message || err)
    res.status(500).json({ error: '수학이가 잠시 쉬고 있어요.' })
  }
})

module.exports = router
