// Wolfram Alpha Short Answers API client.
// Returns the raw answer string on success, null on failure / no result.
// Configure with WOLFRAM_APP_ID env var. Never throws — failures resolve to
// null so callers can fall back to LLM-only solving.
const https = require('https');

let warned = false;

function getApiKey() {
  const key = process.env.WOLFRAM_APP_ID;
  if (!key) {
    if (!warned) {
      console.error('❌ WOLFRAM_APP_ID is not set — Wolfram lookups will be skipped.');
      warned = true;
    }
    return null;
  }
  return key;
}

async function wolframShortAnswer(query) {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (!query || typeof query !== 'string' || !query.trim()) return null;

  const url = `https://api.wolframalpha.com/v1/result?appid=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(query)}`;

  return new Promise((resolve) => {
    let resolved = false;
    const settle = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const trimmed = (data || '').trim();
        if (res.statusCode === 200 && trimmed && !/^Error/i.test(trimmed)) {
          settle(trimmed);
        } else {
          console.warn(`[wolfram] no result (status=${res.statusCode}, body=${JSON.stringify(trimmed.slice(0, 200))})`);
          settle(null);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[wolfram] request error:', err.message || err);
      settle(null);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      console.warn('[wolfram] request timed out');
      settle(null);
    });
  });
}

module.exports = { wolframShortAnswer };
