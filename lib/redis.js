// Upstash Redis via REST (no SDK). Auto-added env: UPSTASH_REDIS_REST_URL / _TOKEN.
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function redisReady() {
  return !!(URL && TOKEN);
}

// Run one command, e.g. redis('SET','k','v') or redis('LRANGE','k',0,10)
export async function redis(...cmd) {
  if (!redisReady()) return null;
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    return j.result;
  } catch (e) {
    console.error('[redis]', e);
    return null;
  }
}

// HGETALL returns a flat [f,v,f,v] array over REST — fold to object.
export function hashToObj(arr) {
  const o = {};
  if (!Array.isArray(arr)) return o;
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}
