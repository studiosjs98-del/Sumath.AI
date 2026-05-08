#!/usr/bin/env node
/**
 * rebuildDatabase.js
 *
 * Generates Korean math questions per subcategory using the OpenAI API
 * and inserts them into the Supabase `problems` table.
 *
 * Usage: node backend/scripts/rebuildDatabase.js [--grade=중1] [--topic=소인수분해] [--force]
 */

'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const openai = require('../services/openaiClient')
const supabase = require('../database/supabase')
const CURRICULUM = require('../database/curriculum')

const MODEL = 'gpt-4o-mini'
const TARGET_PER_TOPIC = 100
const BASIC_COUNT = 33
const MEDIUM_COUNT = 34
const HARD_COUNT = 33
const DELAY_MS = 500

const args = process.argv.slice(2)
const getArg = (name) => {
  const match = args.find(a => a.startsWith(`--${name}=`))
  return match ? match.split('=').slice(1).join('=') : null
}
const gradeFilter = getArg('grade')
const topicFilter = getArg('topic')
const forceMode = args.includes('--force')

function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function shuffleWithSeed(arr, seed) {
  const a = [...arr]
  const rand = seededRand(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildMcOptions(answerLatex, wrongAnswers, seed) {
  const allOptions = [answerLatex, ...wrongAnswers.slice(0, 3)]
  const shuffled = shuffleWithSeed(allOptions, seed)
  const correctIndex = shuffled.indexOf(answerLatex)
  return { options: shuffled, correctIndex }
}

function buildPrompt(grade, curriculum, topic, difficulty, count) {
  let diffLabel, diffDesc, diffValue
  if (difficulty === 'basic') {
    diffLabel = '기초'
    diffValue = '1 또는 2'
    diffDesc = '직접 개념을 적용하는 단순 계산 문제. 수식은 간단하고 단계 수가 적음. 공식을 처음 익히는 학생이 자신감을 쌓을 수 있는 수준.'
  } else if (difficulty === 'medium') {
    diffLabel = '보통'
    diffValue = '3'
    diffDesc = '여러 단계를 거치는 응용 문제. 개념 간 연결이 필요함. 단순 공식 대입이 아닌 개념의 변형·조합이 요구됨.'
  } else {
    diffLabel = '심화'
    diffValue = '4 또는 5'
    diffDesc = '실생활 서술형 문제, 복잡한 다단계 풀이, 개념의 심층 이해가 필요한 문제. 교과서 최고난도 또는 경시대회 수준.'
  }

  return `당신은 한국 중고등학교 수학 문제를 만드는 전문 교육 콘텐츠 작성자입니다.

다음 조건에 맞는 수학 문제 ${count}개를 JSON 배열로 생성해주세요.

## 생성 조건
- 학년: ${grade}
- 교육과정 영역: ${curriculum}
- 단원 (주제): ${topic}
- 난이도: ${diffLabel} (difficulty 값: ${diffValue})
- 문제 수: ${count}개

## 난이도 설명
${diffDesc}

## 출력 형식
반드시 아래 JSON 배열 형식만 출력하세요. 마크다운 코드 블록(\`\`\`) 없이 순수 JSON만 출력하세요.

[
  {
    "question_latex": "한국어로 된 문제 텍스트. 수식은 $...$  형식의 LaTeX 사용. 예: $2x + 3 = 7$일 때, $x$의 값을 구하여라.",
    "answer_latex": "정답을 LaTeX 형식으로. 예: $x = 2$",
    "difficulty": ${diffValue},
    "wrong_answers": ["오답1 (정답과 같은 형식/유형)", "오답2", "오답3"],
    "solution_steps": [
      "1단계: 풀이 설명 (한국어, LaTeX 포함 가능)",
      "2단계: ...",
      "핵심 포인트: ..."
    ],
    "hints": [
      "힌트 1: 어떤 개념을 사용할지 유도 (한국어)",
      "힌트 2: 풀이의 첫 번째 단계 암시",
      "힌트 3: 거의 다 알려주는 힌트"
    ]
  }
]

## 품질 규칙
1. **모든 텍스트는 한국어**로 작성
2. **수식은 반드시 $...$ 형식**의 LaTeX 사용
3. **wrong_answers(오답)**는 정답과 **같은 형식**이어야 함
4. **문제 중복 금지**: ${count}개의 문제가 모두 서로 다른 수치/상황을 다뤄야 함
5. **solution_steps**: 최소 3단계, 각 단계는 명확하고 교육적으로 설명
6. **hints**: 3개, 점진적으로 더 많은 정보 제공
7. **difficulty 값**: 반드시 숫자 ${diffValue}를 사용
8. **wrong_answers**: 반드시 3개 제공

JSON 배열만 출력하세요. 다른 텍스트 없이.`
}

async function generateProblems(grade, curriculum, topic, difficulty, count) {
  const prompt = buildPrompt(grade, curriculum, topic, difficulty, count)

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  })

  const rawText = completion.choices[0]?.message?.content?.trim() ?? ''

  let jsonText = rawText
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim()
  } else {
    const arrayMatch = rawText.match(/\[[\s\S]*\]/)
    if (arrayMatch) jsonText = arrayMatch[0]
  }

  jsonText = jsonText.replace(/\\(?![\\/"nrtbfu])/g, '\\\\')

  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}\nRaw (first 500 chars): ${rawText.slice(0, 500)}`)
  }

  // response_format json_object returns an object — accept both shapes
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.problems)) return parsed.problems
  if (Array.isArray(parsed?.questions)) return parsed.questions
  throw new Error('Response is not an array or recognized object shape')
}

function buildRow(grade, curriculum, topic, question, seed) {
  const {
    question_latex,
    answer_latex,
    difficulty,
    wrong_answers = [],
    solution_steps = [],
    hints = []
  } = question

  if (!question_latex || !answer_latex) {
    throw new Error('Missing question_latex or answer_latex')
  }

  const mcData = buildMcOptions(answer_latex, wrong_answers, seed)

  return {
    grade,
    curriculum,
    unit: topic,
    topic,
    difficulty: typeof difficulty === 'number' ? difficulty : 3,
    question_latex,
    answer_latex,
    solution_steps: JSON.stringify(Array.isArray(solution_steps) ? solution_steps : []),
    hints: JSON.stringify(Array.isArray(hints) ? hints : []),
    tags: JSON.stringify([]),
    mc_options: JSON.stringify(mcData),
  }
}

async function processSubcategory(entry, stats) {
  const { grade, curriculum, topic } = entry
  const label = `[${grade}/${topic}]`

  const { count: existingCount, error: countErr } = await supabase
    .from('problems')
    .select('*', { count: 'exact', head: true })
    .eq('grade', grade)
    .eq('topic', topic)

  if (countErr) {
    console.error(`❌ ${label} count failed: ${countErr.message}`)
    stats.failed++
    return
  }

  const existing = existingCount || 0

  if (existing >= TARGET_PER_TOPIC && !forceMode) {
    console.log(`⚠️  ${label} 건너뜀 — 이미 ${existing}문제 존재`)
    stats.skipped++
    return
  }

  console.log(`\n🚀 ${label} 생성 시작... (기존: ${existing}문제)`)

  if (forceMode && existing > 0) {
    const { error: delErr } = await supabase
      .from('problems')
      .delete()
      .eq('grade', grade)
      .eq('topic', topic)
    if (delErr) {
      console.error(`   ❌ 기존 문제 삭제 실패: ${delErr.message}`)
      stats.failed++
      return
    }
    console.log(`   기존 ${existing}문제 삭제 완료`)
  }

  const tiers = [
    { key: 'basic',    count: BASIC_COUNT,  label: '기초' },
    { key: 'medium',   count: MEDIUM_COUNT, label: '보통' },
    { key: 'advanced', count: HARD_COUNT,   label: '심화' },
  ]

  let totalInserted = 0
  let seedBase = Date.now()

  for (const tier of tiers) {
    try {
      console.log(`   ⏳ ${tier.label} ${tier.count}문제 생성 중...`)
      const problems = await generateProblems(grade, curriculum, topic, tier.key, tier.count)

      const rows = []
      for (const p of problems) {
        try {
          rows.push(buildRow(grade, curriculum, topic, p, seedBase++))
        } catch (rowErr) {
          console.warn(`     ⚠️  문제 변환 오류: ${rowErr.message}`)
        }
      }

      if (rows.length) {
        const { error: insErr } = await supabase.from('problems').insert(rows)
        if (insErr) {
          console.error(`     ❌ 삽입 실패: ${insErr.message}`)
        } else {
          totalInserted += rows.length
        }
      }
      console.log(`   ✅ ${tier.label} ${rows.length}/${tier.count} 삽입 완료`)
    } catch (tierErr) {
      console.error(`   ❌ ${tier.label} 생성 실패: ${tierErr.message}`)
      stats.failed++
    }
  }

  console.log(`✅ ${label} 완료 — 총 ${totalInserted}문제 삽입`)
  stats.generated += totalInserted
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function printSummary(stats, elapsed) {
  const sec = (elapsed / 1000).toFixed(1)
  const min = (elapsed / 60000).toFixed(1)
  console.log('\n' + '═'.repeat(56))
  console.log('  생성 완료 요약')
  console.log('═'.repeat(56))
  console.log(`  총 생성된 문제:   ${stats.generated}`)
  console.log(`  건너뜀 (충분):    ${stats.skipped}`)
  console.log(`  실패한 배치:      ${stats.failed}`)
  console.log(`  소요 시간:        ${sec}초 (${min}분)`)
  console.log('═'.repeat(56))
}

async function main() {
  const startTime = Date.now()

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.')
    process.exit(1)
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
    process.exit(1)
  }

  let targets = CURRICULUM
  if (gradeFilter) {
    targets = targets.filter(e => e.grade === gradeFilter)
    if (!targets.length) { console.error(`❌ 학년 '${gradeFilter}'을 찾을 수 없습니다.`); process.exit(1) }
  }
  if (topicFilter) {
    targets = targets.filter(e => e.topic === topicFilter)
    if (!targets.length) { console.error(`❌ 단원 '${topicFilter}'을 찾을 수 없습니다.`); process.exit(1) }
  }

  console.log('═'.repeat(56))
  console.log('  수학 문제 데이터베이스 재구축 (OpenAI + Supabase)')
  console.log(`  모델: ${MODEL}`)
  console.log(`  대상: ${targets.length}개 단원 × ${TARGET_PER_TOPIC}문제`)
  if (gradeFilter) console.log(`  학년 필터: ${gradeFilter}`)
  if (topicFilter) console.log(`  단원 필터: ${topicFilter}`)
  if (forceMode)   console.log('  --force 모드: 기존 문제 덮어씌우기')
  console.log('═'.repeat(56) + '\n')

  const stats = { generated: 0, skipped: 0, failed: 0 }

  for (let i = 0; i < targets.length; i++) {
    await processSubcategory(targets[i], stats)
    if (i < targets.length - 1) await sleep(DELAY_MS)
  }

  printSummary(stats, Date.now() - startTime)
}

main().catch(err => {
  console.error('❌ 치명적 오류:', err)
  process.exit(1)
})
