const OpenAI = require('openai');

let client = null;
let warned = false;

function getOpenAI() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!warned) {
      console.error('❌ OPENAI_API_KEY is not set — OpenAI calls will fail until it is configured.');
      warned = true;
    }
    throw new Error('OPENAI_API_KEY is not configured');
  }
  client = new OpenAI({ apiKey });
  return client;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getOpenAI()[prop];
    return typeof value === 'function' ? value.bind(getOpenAI()) : value;
  }
});
