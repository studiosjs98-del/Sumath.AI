const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let client = null;
let warned = false;

function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warned) {
      console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — database operations will fail until both are configured.');
      warned = true;
    }
    throw new Error('Supabase environment variables are not configured');
  }
  client = createClient(url, key, {
    realtime: { transport: ws }
  });
  return client;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getSupabase()[prop];
    return typeof value === 'function' ? value.bind(getSupabase()) : value;
  }
});
