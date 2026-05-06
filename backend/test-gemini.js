require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const key = process.env.GEMINI_API_KEY;
console.log('GEMINI_API_KEY set:', !!key, '| first 8 chars:', key ? key.slice(0, 8) + '...' : 'MISSING');

if (!key) {
  console.error('ERROR: GEMINI_API_KEY not found in .env');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(key);

async function run() {
  // Test 1: basic string prompt
  console.log('\n--- Test 1: generateContent with contents array ---');
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Generate 1 math problem as JSON: {"problems": [{"question": "...", "options": ["A","B","C","D"], "answer": "A"}]}' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 500 },
    });
    const text = result.response.text();
    console.log('SUCCESS. Response length:', text.length);
    console.log('Response:', text.slice(0, 300));
  } catch (err) {
    console.error('FAILED:', err.message || err);
    console.error('Status:', err.status);
    console.error('Details:', JSON.stringify(err.errorDetails || err.error || {}, null, 2));
  }

  // Test 2: try gemini-1.5-flash as fallback model name
  console.log('\n--- Test 2: gemini-1.5-flash model name ---');
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Say "hello" in JSON: {"message": "hello"}' }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 50 },
    });
    console.log('SUCCESS with gemini-1.5-flash:', result.response.text());
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

run();
