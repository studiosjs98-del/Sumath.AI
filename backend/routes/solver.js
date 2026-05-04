const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { solveMath } = require('../services/wolframService');
const { authenticate } = require('./middleware');

const router = express.Router();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

router.post('/solve', authenticate, async (req, res) => {
  const { question, studentGrade, studentSteps } = req.body;

  if (!question) {
    return res.status(400).json({ error: '문제를 입력해주세요' });
  }

  try {
    // Step 1: Wolfram gets the correct answer
    const wolframResult = await solveMath(question);

    // Step 2: Build context for Claude
    let wolframContext = '';
    if (wolframResult.success) {
      wolframContext = `
Wolfram Alpha 계산 결과:
- 정답: ${wolframResult.result}
${wolframResult.steps ? `- 풀이: ${wolframResult.steps}` : ''}
      `;
    }

    // Step 3: Stream Claude explanation in Korean
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send Wolfram answer first
    res.write(`data: ${JSON.stringify({
      type: 'wolfram',
      result: wolframResult.result,
      success: wolframResult.success
    })}\n\n`);

    // Claude explains in Korean
    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `
당신은 친절한 한국 수학 선생님입니다.
학년: ${studentGrade || '중학생'}
문제: ${question}
${studentSteps ? `학생 풀이: ${studentSteps}` : ''}
${wolframContext}

다음 형식으로 설명해주세요:

**📌 문제 파악**
[어떤 개념인지]

**✅ 단계별 풀이**
[각 단계마다 이유 설명]

**💡 핵심 포인트**
[꼭 기억할 것]

**⚠️ 자주 하는 실수**
[주의할 점]

친절하고 격려하는 톤으로 써주세요.
        `
      }]
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({
          type: 'text',
          content: chunk.delta.text
        })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Solver error:', error);
    res.status(500).json({ error: '풀이 중 오류가 발생했어요' });
  }
});

module.exports = router;
