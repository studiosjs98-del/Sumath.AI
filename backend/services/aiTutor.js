const openai = require('./openaiClient');

const SYSTEM_PROMPT = `너는 한국 최고의 수학 AI 튜터 '수학이'야. 무조건 한국어로만 답해. 모든 수식은 LaTeX로 작성해. 선생님이 옆에서 가르쳐주는 느낌으로, 따뜻하고 격려하는 톤을 유지해. 절대로 영어로 설명하지 마.`;

async function getHint({ problemLatex, studentSteps, hintNumber, previousHints, grade, topic }) {
  const hintContext = hintNumber === 1
    ? '학생이 처음으로 힌트를 요청했습니다. 방향을 제시하는 질문을 해주세요.'
    : `이것은 ${hintNumber}번째 힌트입니다. 이전 힌트보다 조금 더 구체적으로 안내하되, 여전히 직접 답을 주지 마세요.`;

  const stepsContext = studentSteps && studentSteps.length > 0
    ? `\n\n학생의 풀이 과정:\n${studentSteps.map((s, i) => `${i + 1}단계: ${s}`).join('\n')}`
    : '\n\n학생은 아직 풀이를 시작하지 않았습니다.';

  const prevHintsContext = previousHints && previousHints.length > 0
    ? `\n\n이전 힌트들:\n${previousHints.map((h, i) => `힌트 ${i + 1}: ${h}`).join('\n')}`
    : '';

  const userMessage = `문제 (${grade} ${topic}):\n${problemLatex}${stepsContext}${prevHintsContext}\n\n${hintContext}\n\n학생이 막힌 부분을 파악하고, 소크라테스식 힌트를 제공해주세요. 2-3문장으로 간결하게 작성하세요.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ]
  });

  return response.choices[0].message.content;
}

async function analyzeSteps({ problemLatex, correctSolutionSteps, studentSteps, topic, grade }) {
  if (!studentSteps || studentSteps.length === 0) return null;

  const prompt = `수학 문제 (${grade} ${topic}):\n${problemLatex}\n\n올바른 풀이 단계:\n${correctSolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n학생의 풀이:\n${studentSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n학생의 풀이에서 오류가 있다면 어느 단계에서 어떤 실수를 했는지 짧게 (한 문장) 분석해주세요.\n오류가 없다면 "풀이가 올바릅니다"라고만 답하세요.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });

  return response.choices[0].message.content;
}

async function generateSessionFeedback({ attempts, weakTopics, grade }) {
  const topicList = weakTopics.map(t => `- ${t.topic} (틀린 횟수: ${t.error_count})`).join('\n');

  const prompt = `학생의 오늘 학습 결과 (${grade}):\n총 문제 수: ${attempts.total}\n맞은 문제: ${attempts.correct}\n틀린 문제: ${attempts.total - attempts.correct}\n\n취약한 단원:\n${topicList || '없음'}\n\n이 학생에게 격려가 되고 구체적인 다음 학습 방향을 안내하는 짧은 피드백(3-4문장)을 한국어로 작성해주세요.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = { getHint, analyzeSteps, generateSessionFeedback };
