const express = require('express');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate } = require('./middleware');
const db = require('../database/db');
const { getLanguageInstruction } = require('../utils/language');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

function fixLatexEscapes(raw) {
  // JSON.parse interprets \t → tab, \f → formfeed, \b → backspace, corrupting
  // LaTeX commands like \times→tab+"imes", \frac→formfeed+"rac", \beta→backspace+"eta".
  // Double-escape these backslash+letter sequences BEFORE JSON.parse so they survive.
  // Only targets \t, \f, \b followed by a letter (LaTeX command pattern).
  // Leaves \n, \r, \u, \\, \" alone since those are valid JSON escapes we want to keep.
  return raw.replace(/\\([tbf])(?=[a-zA-Z])/g, '\\\\$1');
}

// ─── Mastery helpers ──────────────────────────────────────────────────────────
function calcMasteryLevel(wrongCount, correctCount, recentJson) {
  if (correctCount === 0 && wrongCount === 0) return 0;
  const recent = JSON.parse(recentJson || '[]');
  // Level 3: 3+ correct answers AND last 3 attempts all correct
  if (correctCount >= 3 && recent.length >= 3 && recent.slice(-3).every(r => r === 'C')) return 3;
  // Level 2: correct >= wrong (net positive), but not yet mastered
  if (correctCount >= wrongCount) return 2;
  // Level 1: still struggling
  return 1;
}

function updateMastery(userId, conceptTag, isCorrect) {
  if (!conceptTag || !conceptTag.trim()) return null;
  const tag = conceptTag.trim().slice(0, 100);
  const existing = db.prepare('SELECT * FROM mastery WHERE user_id = ? AND concept_tag = ?').get(userId, tag);

  if (!existing) {
    const recentJson = JSON.stringify([isCorrect ? 'C' : 'W']);
    const newWrong = isCorrect ? 0 : 1;
    const newCorrect = isCorrect ? 1 : 0;
    const level = isCorrect ? calcMasteryLevel(0, 1, recentJson) : 1;
    if (isCorrect) {
      db.prepare('INSERT OR IGNORE INTO mastery (user_id, concept_tag, wrong_count, correct_count, mastery_level, recent_results, last_attempted, last_correct) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))').run(userId, tag, newWrong, newCorrect, level, recentJson);
    } else {
      db.prepare('INSERT OR IGNORE INTO mastery (user_id, concept_tag, wrong_count, correct_count, mastery_level, recent_results, last_attempted) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))').run(userId, tag, newWrong, newCorrect, level, recentJson);
    }
    return db.prepare('SELECT * FROM mastery WHERE user_id = ? AND concept_tag = ?').get(userId, tag);
  }

  const recentArr = JSON.parse(existing.recent_results || '[]');
  recentArr.push(isCorrect ? 'C' : 'W');
  if (recentArr.length > 3) recentArr.shift();
  const recentJson = JSON.stringify(recentArr);
  const newWrong = existing.wrong_count + (isCorrect ? 0 : 1);
  const newCorrect = existing.correct_count + (isCorrect ? 1 : 0);

  let newLevel;
  if (isCorrect) {
    newLevel = calcMasteryLevel(newWrong, newCorrect, recentJson);
  } else {
    const recalc = calcMasteryLevel(newWrong, newCorrect, recentJson);
    const dropped = existing.mastery_level > 1 ? existing.mastery_level - 1 : 1;
    newLevel = Math.max(1, Math.min(dropped, recalc));
  }

  if (isCorrect) {
    db.prepare('UPDATE mastery SET wrong_count = ?, correct_count = ?, mastery_level = ?, recent_results = ?, last_attempted = datetime(\'now\'), last_correct = datetime(\'now\') WHERE id = ?').run(newWrong, newCorrect, newLevel, recentJson, existing.id);
  } else {
    db.prepare('UPDATE mastery SET wrong_count = ?, correct_count = ?, mastery_level = ?, recent_results = ?, last_attempted = datetime(\'now\') WHERE id = ?').run(newWrong, newCorrect, newLevel, recentJson, existing.id);
  }
  return { ...existing, wrong_count: newWrong, correct_count: newCorrect, mastery_level: newLevel };
}

function safeParseJson(text) {
  const pre = fixLatexEscapes(text);
  try { return JSON.parse(pre); }
  catch {
    try {
      const fixed = pre.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(fixed);
    } catch {
      try {
        const match = pre.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
      } catch {}
      return null;
    }
  }
}

// POST /api/analysis/wrong-questions
// Track a wrong answer; increment attempt_count if same question+concept_tag already exists
router.post('/wrong-questions', authenticate, (req, res) => {
  try {
    const { question_text, correct_answer, student_answer, topic, concept_tag } = req.body;
    const userId = req.studentId;

    const existing = db.prepare(
      'SELECT id FROM wrong_questions WHERE user_id = ? AND question_text = ?'
    ).get(userId, String(question_text || '').slice(0, 500));

    if (existing) {
      db.prepare(
        'UPDATE wrong_questions SET attempt_count = attempt_count + 1, timestamp = datetime(\'now\') WHERE id = ?'
      ).run(existing.id);
    } else {
      db.prepare(
        'INSERT INTO wrong_questions (user_id, question_text, correct_answer, student_answer, topic, concept_tag) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        userId,
        String(question_text || '').slice(0, 1000),
        String(correct_answer || '').slice(0, 500),
        String(student_answer || '').slice(0, 500),
        String(topic || '').slice(0, 100),
        String(concept_tag || '').slice(0, 100)
      );
    }
    updateMastery(userId, String(concept_tag || topic || ''), false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[wrong-questions] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/practice-sessions
// Record a completed practice session
router.post('/practice-sessions', authenticate, (req, res) => {
  try {
    const { score, total } = req.body;
    db.prepare(
      'INSERT INTO practice_sessions (user_id, score, total) VALUES (?, ?, ?)'
    ).run(req.studentId, Number(score) || 0, Number(total) || 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('[practice-sessions] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/record-correct
// Records a correct answer and updates mastery level for a concept
router.post('/record-correct', authenticate, (req, res) => {
  try {
    const { concept_tag } = req.body;
    const userId = req.studentId;
    if (!concept_tag) return res.json({ ok: false });
    const before = db.prepare('SELECT mastery_level FROM mastery WHERE user_id = ? AND concept_tag = ?').get(userId, String(concept_tag).trim());
    const prev_level = before?.mastery_level ?? 0;
    const updated = updateMastery(userId, String(concept_tag), true);
    res.json({ ok: true, mastery_level: updated?.mastery_level ?? 0, prev_level, concept_tag });
  } catch (err) {
    console.error('[record-correct] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

// GET /api/analysis/:userId
// Returns aggregated weakness data for the authenticated user (userId param is ignored for security)
router.get('/:userId', authenticate, (req, res) => {
  try {
    const userId = req.studentId;

    const allWrong = db.prepare(
      'SELECT * FROM wrong_questions WHERE user_id = ? ORDER BY attempt_count DESC, timestamp DESC'
    ).all(userId);

    // Group by concept_tag
    const grouped = {};
    for (const q of allWrong) {
      const tag = (q.concept_tag && q.concept_tag.trim()) || (q.topic && q.topic.trim()) || '기타';
      if (!grouped[tag]) {
        grouped[tag] = { topic: q.topic || tag, concept_tag: tag, count: 0, questions: [] };
      }
      grouped[tag].count += q.attempt_count;
      grouped[tag].questions.push({
        id: q.id,
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        attempt_count: q.attempt_count,
        timestamp: q.timestamp
      });
    }

    const masteryRows = db.prepare('SELECT * FROM mastery WHERE user_id = ?').all(userId);
    const masteryMap = {};
    for (const m of masteryRows) masteryMap[m.concept_tag] = m;

    const weakTopics = Object.values(grouped)
      .map(t => ({ ...t, mastery_level: masteryMap[t.concept_tag]?.mastery_level ?? 0 }))
      .sort((a, b) => {
        // Mastery 3 (done) goes last; within same level, sort by error count desc
        if (a.mastery_level !== b.mastery_level) return a.mastery_level - b.mastery_level;
        return b.count - a.count;
      })
      .slice(0, 10);

    const sessions = db.prepare(
      'SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY timestamp DESC'
    ).all(userId);

    res.json({
      weakTopics,
      totalWrong: allWrong.length,
      totalSessions: sessions.length,
      recentSessions: sessions.slice(0, 5)
    });
  } catch (err) {
    console.error('[analysis] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/generate-analysis
// Sends wrong question data to Claude Haiku for a personalised Korean analysis
router.post('/generate-analysis', authenticate, async (req, res) => {
  try {
    const userId = req.studentId;
    const { language } = req.body || {};
    const langInstruction = getLanguageInstruction(language);

    const allWrong = db.prepare(
      'SELECT * FROM wrong_questions WHERE user_id = ? ORDER BY attempt_count DESC'
    ).all(userId);

    if (allWrong.length < 3) {
      return res.json({ analysis: null, insufficient: true });
    }

    // Aggregate by concept_tag
    const grouped = {};
    for (const q of allWrong) {
      const tag = (q.concept_tag && q.concept_tag.trim()) || (q.topic && q.topic.trim()) || '기타';
      if (!grouped[tag]) grouped[tag] = { tag, count: 0, examples: [] };
      grouped[tag].count += q.attempt_count;
      if (grouped[tag].examples.length < 2) grouped[tag].examples.push(q.question_text);
    }

    const topTopics = Object.values(grouped).sort((a, b) => b.count - a.count);
    const summary = topTopics
      .map(g => `- ${g.tag}: ${g.count}회 틀림${g.examples[0] ? ` (예: "${g.examples[0].slice(0, 60)}...")` : ''}`)
      .join('\n');
    const sessions = db.prepare('SELECT COUNT(*) as cnt FROM practice_sessions WHERE user_id = ?').get(userId);

    const userPrompt = `학생 약점 데이터:

${summary}

총 틀린 문제: ${allWrong.length}개
연습 세션 수: ${sessions?.cnt || 0}회
가장 약한 개념: ${topTopics[0]?.tag || '없음'} (${topTopics[0]?.count || 0}회)
두 번째 약점: ${topTopics[1]?.tag || '없음'} (${topTopics[1]?.count || 0}회)

너는 수학 학습 데이터 분석 전문가야. 위 데이터를 보고 분석해줘.

분석 규칙:
- 절대로 일반적인 조언 하지 마 ('열심히 해', '기초부터' 같은 말 금지)
- 구체적인 숫자와 패턴만 언급해
- 학생이 '어떻게 이걸 알아?' 라고 느낄 만큼 구체적으로 써
- 반말, 친한 선배 톤
- 이모지 없음

반드시 아래 4개 섹션만 이 형식으로 출력해 (다른 텍스트 없이):
[진단] 가장 충격적인 패턴 하나를 한 문장으로. 예: '${topTopics[0]?.tag || '확률'}에서 ${topTopics[0]?.count || 0}번 틀렸는데 전부 같은 유형에서 막혔어'
[패턴] 틀린 문제들 사이의 숨겨진 공통점. 단순 토픽 나열 금지, 실제 실수 패턴 분석 (2~3문장)
[지금 당장] 이번 주 안에 할 수 있는 딱 한 가지 구체적 행동. 예: '${topTopics[0]?.tag || '해당 단원'} 교과서 예제 10개만 다시 풀어봐. 풀 때 풀이 과정을 단계별로 적는 연습만 해' (2~3문장)
[수능 영향] 현재 약점이 수능 몇 문제에 영향을 주는지 구체적으로 (1~2문장)`;

    const systemPrompt = langInstruction + '\n\n너는 수학 학습 분석 전문가야. 반드시 [진단], [패턴], [지금 당장], [수능 영향] 4개 섹션만 출력해. 이모지 없음. 구체적인 수치 언급 필수.';

    let analysisText = null;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      analysisText = msg.content[0]?.text || null;
    } catch (claudeErr) {
      console.warn('[generate-analysis] Claude failed, falling back to OpenAI:', claudeErr.message);
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      analysisText = r.choices[0]?.message?.content || null;
    }

    // Parse sections from the structured response
    const sections = {};
    if (analysisText) {
      const re = /\[([^\]]+)\]\s*([\s\S]*?)(?=\n\[|$)/g;
      let m;
      while ((m = re.exec(analysisText)) !== null) {
        sections[m[1].trim()] = m[2].trim();
      }
    }

    res.json({ analysis: analysisText, sections: Object.keys(sections).length > 0 ? sections : null });
  } catch (err) {
    console.error('[generate-analysis] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/generate-weakness-test
// Generates 10 MCQ questions focused on the student's weak concept_tags
router.post('/generate-weakness-test', authenticate, async (req, res) => {
  try {
    const { topic, grade } = req.body;
    const userId = req.studentId;

    let targetTopics = [];
    if (topic && topic.trim()) {
      targetTopics = [topic.trim()];
    } else {
      const rows = db.prepare(
        `SELECT concept_tag, topic, SUM(attempt_count) as total
         FROM wrong_questions WHERE user_id = ?
         GROUP BY concept_tag ORDER BY total DESC LIMIT 5`
      ).all(userId);
      const masteredTags = new Set(
        db.prepare('SELECT concept_tag FROM mastery WHERE user_id = ? AND mastery_level = 3').all(userId).map(r => r.concept_tag)
      );
      targetTopics = rows
        .map(r => (r.concept_tag && r.concept_tag.trim()) || (r.topic && r.topic.trim()))
        .filter(tag => tag && !masteredTags.has(tag));
    }
    if (targetTopics.length === 0) targetTopics = ['확률', '함수'];

    const prompt = `너는 한국 수학 튜터야. 아래 개념들에 집중한 연습 문제 10개를 만들어줘.

집중 개념: ${targetTopics.join(', ')}
학년: ${grade || '고1'}

규칙:
- 수능 스타일 4지선다 문제
- 모든 수식은 반드시 $...$ 로 감싸서 LaTeX 사용. 날 텍스트 금지.
- 한국어로만 작성. 한자 절대 금지.
- correctIndex는 0~3 중 랜덤하게 분포. 모두 0이면 안 돼.
- topic 필드에 해당 문제의 개념 태그를 반드시 포함 (집중 개념 중 하나)

JSON 형식으로만 출력 (다른 텍스트 없이):
[{
  "question": "문제 텍스트 ($LaTeX$ 사용)",
  "choices": ["$선택지1$", "$선택지2$", "$선택지3$", "$선택지4$"],
  "correctIndex": 0,
  "answer_latex": "정답 값",
  "topic": "개념 태그",
  "wrongAnswerExplanation": "왜 틀리기 쉬운지 핵심 설명 2문장",
  "steps": [{"title": "단계 1: 제목", "content": "풀이 내용. 모든 수식은 $수식$ 형식으로 감싸야 해."}]
}]`;

    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4000,
      messages: [
        { role: 'system', content: '너는 한국 수학 튜터야. 무조건 JSON만 출력해. 한자 사용 금지.' },
        { role: 'user', content: prompt }
      ]
    });

    const raw = r.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonText = extractJson(cleaned) || cleaned;
    const parsed = safeParseJson(jsonText);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.json({ questions: [] });
    }

    const normalized = parsed.slice(0, 10).map(q => {
      if (!q || typeof q !== 'object') return null;
      const options = (Array.isArray(q.choices) ? q.choices : []).map(String);
      while (options.length < 4) options.push('(보기 없음)');
      const correct_index = typeof q.correctIndex === 'number'
        ? Math.min(3, Math.max(0, q.correctIndex))
        : 0;
      const steps = Array.isArray(q.steps)
        ? q.steps.map(s => ({ title: String(s.title || ''), content: String(s.content || '') })).filter(s => s.title)
        : [];
      return {
        question_latex: String(q.question || ''),
        options: options.slice(0, 4),
        correct_index,
        answer_latex: String(q.answer_latex || ''),
        topic: String(q.topic || targetTopics[0] || ''),
        steps,
        wrongAnswerExplanation: String(q.wrongAnswerExplanation || '')
      };
    }).filter(q => q && q.question_latex);

    for (const q of normalized) {
      while (q.options.length < 4) q.options.push('(보기 없음)');
    }

    res.json({ questions: normalized });
  } catch (err) {
    console.error('[generate-weakness-test] error:', err.message);
    res.status(500).json({ error: err.message, questions: [] });
  }
});

module.exports = router;
