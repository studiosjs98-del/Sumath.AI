const express = require('express')
const multer = require('multer')
const Groq = require('groq-sdk')
const { authenticate } = require('./middleware')

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SYSTEM = `당신은 한국 수학 교육 전문가이자 AI 튜터입니다. 학생이 업로드한 수학 문제나 풀이 사진을 분석하고 도움을 드립니다.

응답 시 반드시 다음 마크다운 형식을 사용하세요:

## 문제 인식
이미지에서 파악한 수학 문제를 정확히 서술해주세요.

## 오류 분석
(풀이가 있는 경우) 학생이 어디서 실수했는지 구체적으로 설명하세요. 풀이가 없으면 이 섹션을 생략하세요.

## 단계별 풀이
정확한 풀이를 단계별로 친절하게 설명하세요. 수식은 $LaTeX$ 형태로 작성하세요.

## 핵심 개념
이 문제와 관련된 중요한 수학 개념을 2-3가지 간단히 정리해주세요.

규칙: 절대로 정답만 알려주지 말고, 풀이 과정과 이해를 중심으로 설명하세요. 한국어로 친절하고 격려하는 어조로 작성하세요.`

router.post('/analyze', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '이미지를 업로드해주세요.' })

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!validTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'JPG, PNG, GIF, WEBP 형식만 지원합니다.' })
  }

  try {
    const base64 = req.file.buffer.toString('base64')
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 수학 문제/풀이 사진을 분석하고 도움을 주세요. 학생의 풀이가 있다면 오류도 찾아주세요.' },
            { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${base64}` } }
          ]
        }
      ]
    })

    res.json({ analysis: response.choices[0].message.content })
  } catch (err) {
    console.error('Photo AI error:', err.message || err)
    res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
  }
})

module.exports = router
