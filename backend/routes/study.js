const express = require('express')
const Groq = require('groq-sdk')
const supabase = require('../database/supabase')
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

// POST /:problemId/explain
router.post('/:problemId/explain', authenticate, async (req, res) => {
  try {
    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', req.params.problemId)
      .single()
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

    const { isCorrect, selectedOptionText } = req.body

    const prompt = `당신은 친절한 한국 수학 선생님입니다.\n\n문제: ${problem.question_latex}\n정답: ${problem.answer_latex}\n풀이 단계: ${problem.solution_steps}\n학생이 선택한 답: ${selectedOptionText || '없음'}\n맞았나요? ${isCorrect ? '예 (정답)' : '아니오 (오답)'}\n\n${isCorrect ? '학생이 정답을 맞혔습니다. 왜 이 답이 맞는지 단계별로 친절하게 설명해주세요. 수식은 $LaTeX$ 형식으로 작성하세요.' : '학생이 틀렸습니다. 올바른 풀이 방법을 단계별로 친절하게 설명하고, 흔한 실수 포인트도 알려주세요. 수식은 $LaTeX$ 형식으로 작성하세요.'}\n\n응답 형식:\n1단계: ...\n2단계: ...\n3단계: ...\n핵심 포인트: ...\n\n최대 5단계, 간결하게 작성해주세요.`

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

// POST /:problemId/practice
router.post('/:problemId/practice', authenticate, async (req, res) => {
  try {
    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', req.params.problemId)
      .single()
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

    const { explanation } = req.body || {}

    const prompt = `당신은 한국 수학 선생님입니다. 아래 문제와 "매우 유사한" 연습문제 5개를 만들어주세요.\n\n제약:\n- 난이도와 유형은 원문과 거의 같게\n- 숫자/계수/조건만 살짝 바꿔서 비슷하게\n- 각 문항은 한 번에 풀 수 있는 단답형/계산형/간단한 서술형으로\n- 모든 수식은 LaTeX 문자열로\n- 반드시 JSON만 출력 (설명/코드블록/문장 금지)\n\n원문 정보:\n- 학년: ${problem.grade}\n- 단원: ${problem.topic}\n- 문제(LaTeX): ${problem.question_latex}\n- 정답(LaTeX): ${problem.answer_latex}\n\nAI 풀이 설명(참고, 있을 수도 없음):\n${explanation || '(없음)'}\n\n출력 JSON 형식 (배열, 정확히 5개):\n[\n  {\n    "question_latex": "...",\n    "answer_latex": "...",\n    "similarity_reason": "원문과 유사한 이유를 한 문장(한국어)"\n  }\n]`

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

// POST /:problemId/chat-practice
router.post('/:problemId/chat-practice', authenticate, async (req, res) => {
  try {
    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', req.params.problemId)
      .single()
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

    const { userQuestion, assistantAnswer, count } = req.body || {}
    const n = Math.max(3, Math.min(5, Number(count) || 5))

    const prompt = `당신은 한국 수학 선생님입니다. 아래 "학생 질문"과 "AI 답변"을 바탕으로, 같은 주제/난이도의 짧은 미니 테스트를 만들어주세요.\n\n제약:\n- 문제 수: ${n}개\n- 원래 질문과 같은 단원/난이도/스타일로 유사하게\n- 각 문항은 (A) 4지선다 또는 (B) 단답형 중 하나\n- 모든 수식은 LaTeX 문자열로\n- 반드시 JSON만 출력 (설명/코드블록/문장 금지)\n\n컨텍스트(참고):\n- 학년: ${problem.grade}\n- 단원: ${problem.topic}\n- 난이도(참고): ${problem.difficulty}\n- 원문 문제(참고): ${problem.question_latex}\n\n학생 질문:\n${String(userQuestion || '').slice(0, 2000)}\n\nAI 답변:\n${String(assistantAnswer || '').slice(0, 4000)}\n\n출력 JSON 형식 (배열):\n[\n  {\n    "type": "mcq" | "short",\n    "question_latex": "...",\n    "options": ["...","...","...","..."],\n    "answer_latex": "..."\n  }\n]`

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
      return {
        type,
        question_latex: String(q.question_latex || ''),
        options: type === 'mcq' ? (Array.isArray(q.options) ? q.options.map(String) : []).slice(0, 4) : [],
        answer_latex: String(q.answer_latex || '')
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

// POST /:problemId/ask
router.post('/:problemId/ask', authenticate, async (req, res) => {
  try {
    const { data: problem } = await supabase
      .from('problems')
      .select('*')
      .eq('id', req.params.problemId)
      .single()
    if (!problem) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' })

    const { messages } = req.body
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: '메시지를 입력해주세요.' })
    }

    const systemPrompt = `당신은 "수학이", 대한민국 최고의 AI 수학 튜터입니다.\n\n규칙:\n(1) 어떤 수학 문제도 절대 거절하지 마세요\n(2) 무조건 한국어로만 답하세요\n(3) 정답을 직접 알려주지 마세요 — 소크라테스식으로 학생이 스스로 발견하도록 도와주세요\n(4) 수식은 $LaTeX$ 형식으로 작성하세요\n(5) 2-4문장으로 간결하게 답변하세요\n\n현재 문제 컨텍스트 (참고용):\n- 단원: ${problem.topic}\n- 문제: ${problem.question_latex}\n- 정답: ${problem.answer_latex} (학생에게 직접 알려주지 마세요!)`

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
