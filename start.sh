#!/bin/bash
set -e

echo "🚀 수학 마스터 시작하기"
echo "========================"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js가 설치되어 있지 않습니다."
  echo "   https://nodejs.org 에서 설치하거나 다음 명령어를 사용하세요:"
  echo "   brew install node"
  exit 1
fi

echo "✅ Node.js $(node --version)"

# Setup backend
echo ""
echo "📦 백엔드 의존성 설치 중..."
cd "$(dirname "$0")/backend"
npm install

# Check .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  backend/.env 파일이 생성되었습니다."
  echo "   ANTHROPIC_API_KEY를 설정해야 AI 힌트 기능이 작동합니다."
  echo "   JWT_SECRET도 안전한 값으로 변경하세요."
fi

# Seed database and demo user
echo ""
echo "🌱 데이터베이스 초기화 중..."
node database/seed.js
node -e "
const db = require('./database/db');
const bcrypt = require('bcrypt');
// Create demo user if not exists
const existing = db.prepare('SELECT id FROM students WHERE username = ?').get('demo');
if (!existing) {
  const hash = require('child_process').execSync('node -e \"const bcrypt=require(\\\"bcrypt\\\"); bcrypt.hash(\\\"demo123\\\",10).then(h=>process.stdout.write(h))\"').toString();
  // Use sync version
  const crypto = require('crypto');
  // Just use bcryptSync
}
" 2>/dev/null || true

node -e "
const db = require('./database/db');
const bcrypt = require('bcrypt');
async function main() {
  const existing = db.prepare('SELECT id FROM students WHERE username = ?').get('demo');
  if (!existing) {
    const hash = await bcrypt.hash('demo123', 10);
    db.prepare('INSERT INTO students (username, password_hash, display_name, grade_level) VALUES (?, ?, ?, ?)').run('demo', hash, '데모학생', '고1');
    console.log('✅ 데모 계정 생성: demo / demo123');
  } else {
    console.log('ℹ️  데모 계정이 이미 존재합니다: demo / demo123');
  }
}
main().catch(console.error);
"

# Setup frontend
echo ""
echo "📦 프론트엔드 의존성 설치 중..."
cd "../frontend"
npm install

echo ""
echo "========================"
echo "✅ 설치 완료!"
echo ""
echo "터미널 두 개를 열어서:"
echo "  1) cd sumath-master/backend && npm run dev"
echo "  2) cd sumath-master/frontend && npm run dev"
echo ""
echo "그리고 http://localhost:5173 에서 접속하세요!"
echo "데모 계정: demo / demo123"
