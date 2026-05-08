const express = require('express')
const openai = require('../services/openaiClient')
const { authenticate } = require('./middleware')

const router = express.Router()

const SYSTEM = `당신은 "수학이", 대한민국 최고의 AI 수학 튜터입니다. 중학교부터 수능, 대학 수학까지 모든 수학을 완벽히 가르칩니다.

규칙:
(1) 어떤 수학 문제도 절대 거절하지 마세요 — 학생 학년과 관계없이 모든 주제에 답하세요
(2) 무조건 한국어로만 답하세요 — 학생이 영어로 질문해도 반드시 한국어로만 답하세요
(3) 단계별로 자세히 설명하세요
(4) 학생 학년은 설명 난이도 조절에만 사용하고 절대 주제 제한에 사용하지 마세요
(5) 모든 수식은 $...$ 또는 $$...$$ LaTeX 형식으로 작성하세요

하위 문제 형식 규칙 (MULTIPLE SUB-QUESTIONS FORMAT):
문제에 하위 문제(1. 2. 3. 또는 (a) (b) (c) 또는 (가) (나))가 있는 경우:
- 풀이 과정은 ① ② ③ 형식으로 한 번만 보여주세요
- 그런 다음 각 답을 마지막에 명확하게 따로 표기하세요
- 정확히 이 형식을 사용하세요:

문제 1: [답 값] [ANSWER_1]값[/ANSWER_1]

문제 2: [답 값] [ANSWER_2]값[/ANSWER_2]

문제 3: [답 값] [ANSWER_3]값[/ANSWER_3]

- 답은 단순하게 — 한 줄에 하나씩만 작성하세요
- 서로 다른 문제의 답을 하나로 합치지 마세요

추가 지침:
- 소크라테스식 방법으로 학생이 스스로 이해하도록 도와주세요
- 따뜻하고 친절한 어조를 유지하고 학생을 격려하세요
- 어려운 개념은 쉬운 비유나 예시로 설명하세요`

// Authenticated chat for logged-in students
router.post('/message', authenticate, async (req, res) => {
  const { messages } = req.body
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: '메시지를 입력해주세요.' })
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM },
        ...messages.slice(-12).map(m => ({ role: m.role, content: m.content }))
      ]
    })
    res.json({ reply: response.choices[0].message.content })
  } catch (err) {
    console.error('Chat error:', err.message || err)
    res.status(500).json({ error: '수학이가 잠시 쉬고 있어요. 다시 시도해주세요.' })
  }
})

// Public demo endpoint — no auth required, for landing page
router.post('/demo', async (req, res) => {
  const problem = req.body.problem || '$\\sqrt{16} + \\sqrt{25}$의 값을 구하시오.'
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `이 문제에 대한 첫 번째 힌트를 3문장으로 주세요. 절대 정답은 알려주지 마세요: ${problem}` }
      ]
    })
    res.json({ hint: response.choices[0].message.content })
  } catch (err) {
    console.error('Demo hint error:', err.message || err)
    res.status(500).json({ error: 'AI 서비스를 일시적으로 이용할 수 없습니다.' })
  }
})

module.exports = router
