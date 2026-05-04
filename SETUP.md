# 수학 마스터 — 설치 및 실행 가이드

## 사전 준비

1. **Node.js 설치** (v18 이상 권장)
   ```bash
   brew install node
   # 또는 https://nodejs.org 에서 다운로드
   ```

2. **Anthropic API 키 설정**
   - https://console.anthropic.com 에서 키 발급
   - `backend/.env` 파일에서 `ANTHROPIC_API_KEY=` 뒤에 키 입력

## 실행 방법

터미널 창 **두 개**를 열어서:

### 터미널 1 — 백엔드
```bash
cd ~/sumath-master/backend
npm install
node database/seed.js        # 문제 데이터 초기화
npm run dev                  # 서버 시작 (포트 3001)
```

### 터미널 2 — 프론트엔드
```bash
cd ~/sumath-master/frontend
npm install
npm run dev                  # 개발 서버 시작 (포트 5173)
```

브라우저에서 **http://localhost:5173** 접속

## 데모 계정 만들기

백엔드 실행 후 아래 명령어로 데모 계정을 생성하세요:

```bash
cd ~/sumath-master/backend
node -e "
const db = require('./database/db');
const bcrypt = require('bcrypt');
bcrypt.hash('demo123', 10).then(hash => {
  try {
    db.prepare('INSERT INTO students (username, password_hash, display_name, grade_level) VALUES (?, ?, ?, ?)').run('demo', hash, '데모학생', '고1');
    console.log('✅ 데모 계정 생성: demo / demo123');
  } catch(e) { console.log('이미 존재합니다'); }
});
"
```

또는 앱에서 직접 **회원가입**하세요.

## 프로젝트 구조

```
sumath-master/
├── backend/
│   ├── server.js              # Express 서버 진입점
│   ├── database/
│   │   ├── db.js              # SQLite 연결 + 스키마
│   │   └── seed.js            # 27개 문제 시드 데이터
│   ├── services/
│   │   ├── spacedRepetition.js  # SM-2 간격반복 알고리즘
│   │   ├── aiTutor.js           # Claude API 소크라테스 힌트
│   │   └── analytics.js         # XP, 급수, 취약 단원 분석
│   └── routes/
│       ├── auth.js            # 로그인/회원가입
│       ├── problems.js        # 문제 API
│       ├── sessions.js        # 학습 세션 API
│       ├── hints.js           # AI 힌트 API
│       └── progress.js        # 분석/통계 API
└── frontend/
    └── src/
        ├── App.jsx
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── DashboardPage.jsx
        │   ├── StudyPage.jsx
        │   └── ProgressPage.jsx
        └── components/
            ├── Layout.jsx
            ├── MathRenderer.jsx   # KaTeX 수식 렌더링
            ├── HintPanel.jsx      # AI 힌트 패널
            ├── Scratchpad.jsx     # 단계별 풀이 공간
            ├── ConfidenceButtons.jsx  # 틀림/헷갈림/맞음
            ├── StreakBadge.jsx    # 연속 학습 배지
            └── XPBar.jsx         # 경험치 바
```

## 주요 기능

- **간격 반복 (SM-2)**: 틀린 문제는 1일 후, 맞은 문제는 점점 늘어나는 간격으로 복습
- **AI 소크라테스 힌트**: Claude가 답을 알려주지 않고 질문으로 유도
- **단계별 풀이**: 각 단계를 입력하면 AI가 검토
- **급수 시스템**: 9급 → 8급 → ... → 1급 → 초단 → 1단 → ... → 사범
- **취약 단원 분석**: 틀린 문제 패턴으로 집중 학습 방향 제시
