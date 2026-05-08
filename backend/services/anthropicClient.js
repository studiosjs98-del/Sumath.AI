const Anthropic = require('@anthropic-ai/sdk');

let client = null;
let warned = false;

function getAnthropic() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (!warned) {
      console.error('❌ ANTHROPIC_API_KEY is not set — Anthropic calls will fail until it is configured.');
      warned = true;
    }
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  client = new Anthropic({ apiKey });
  return client;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getAnthropic()[prop];
    return typeof value === 'function' ? value.bind(getAnthropic()) : value;
  }
});
