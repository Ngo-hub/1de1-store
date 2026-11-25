// Operator state in Upstash Redis. Degrades safely when Redis isn't linked yet.
import { redis, redisReady, hashToObj } from './redis.js';

const K = {
  mode: 'ngo:mode',
  log: 'ngo:log',
  chat: 'ngo:chat',
  counters: (d) => `ngo:counters:${d}`,
};

const today = () => new Date().toISOString().slice(0, 10);

export async function getState() {
  if (!redisReady()) return { mode: 'normal', awayUntil: null, instructions: '', linked: false };
  const raw = await redis('GET', K.mode);
  const s = raw ? safeParse(raw) : {};
  return { mode: s.mode || 'normal', awayUntil: s.awayUntil || null, instructions: s.instructions || '', linked: true };
}

export async function setState(patch) {
  const cur = await getState();
  const next = { ...cur, ...patch };
  if (redisReady()) {
    await redis('SET', K.mode, JSON.stringify({ mode: next.mode, awayUntil: next.awayUntil, instructions: next.instructions }));
  }
  return next;
}

export async function writeLog(type, msg) {
  const entry = { t: Date.now(), type, msg };
  if (redisReady()) {
    await redis('LPUSH', K.log, JSON.stringify(entry));
    await redis('LTRIM', K.log, 0, 499);
  }
  return entry;
}

export async function getLog(n = 30) {
  if (!redisReady()) return [];
  const rows = (await redis('LRANGE', K.log, 0, n - 1)) || [];
  return rows.map(safeParse).filter(Boolean);
}

export async function getChat() {
  if (!redisReady()) return [];
  const rows = (await redis('LRANGE', K.chat, 0, 39)) || [];
  return rows.map(safeParse).filter(Boolean).reverse();
}

export async function pushChat(role, content) {
  if (!redisReady()) return;
  await redis('LPUSH', K.chat, JSON.stringify({ role, content }));
  await redis('LTRIM', K.chat, 0, 39);
}

export async function bumpCounter(field, by = 1) {
  if (!redisReady()) return;
  await redis('HINCRBY', K.counters(today()), field, by);
}

export async function getCounters() {
  if (!redisReady()) return {};
  return hashToObj(await redis('HGETALL', K.counters(today())));
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
